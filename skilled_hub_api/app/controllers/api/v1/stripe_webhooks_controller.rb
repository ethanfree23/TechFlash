# frozen_string_literal: true

module Api
  module V1
    # Does not inherit ApplicationController — avoids JSON body rewind / token auth.
    class StripeWebhooksController < ActionController::API
      def create
        payload = request.body.read
        sig_header = request.env['HTTP_STRIPE_SIGNATURE']
        secret = ENV['STRIPE_WEBHOOK_SECRET'].presence || Rails.application.credentials.dig(:stripe, :webhook_secret).presence

        unless secret.present?
          Rails.logger.warn('[stripe webhook] STRIPE_WEBHOOK_SECRET not configured — ignoring')
          return head :ok
        end

        begin
          event = Stripe::Webhook.construct_event(payload, sig_header, secret)
        rescue JSON::ParserError, Stripe::SignatureVerificationError => e
          Rails.logger.warn("[stripe webhook] verify failed: #{e.message}")
          return head :bad_request
        end

        existing = StripeWebhookEvent.find_by(stripe_event_id: event.id)
        return head :ok if existing&.processed_at.present?

        StripeWebhookEvent.transaction do
          rec = StripeWebhookEvent.lock.find_or_initialize_by(stripe_event_id: event.id)
          unless rec.processed_at.present?
            rec.event_type = event.type
            rec.payload = payload
            rec.save!
            process_event(event)
            rec.update!(processed_at: Time.current)
          end
        end

        head :ok
      end

      private

      def process_event(event)
        case event.type
        when 'payment_intent.succeeded'
          pi = event.data.object
          job_id = pi.metadata&.[]('job_id')
          return if job_id.blank?

          job = Job.find_by(id: job_id)
          return unless job

          payment = job.payments.find_by(stripe_payment_intent_id: pi.id)
          return unless payment

          return if payment.status == 'held' || payment.status == 'released'

          payment.update!(
            status: 'held',
            held_at: Time.zone.at(pi.created),
            stripe_payment_intent_id: pi.id
          )
        when 'charge.refunded'
          Rails.logger.info("[stripe webhook] charge.refunded id=#{event.id}")
        else
          Rails.logger.info("[stripe webhook] unhandled type=#{event.type} id=#{event.id}")
        end
      end
    end
  end
end
