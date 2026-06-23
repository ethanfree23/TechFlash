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
        when 'checkout.session.completed'
          session = event.data.object
          if session.mode.to_s == "subscription"
            subscription_id = session.subscription.to_s
            return if subscription_id.blank?

            subscription = Stripe::Subscription.retrieve(subscription_id)
            MembershipSubscriptionService.sync_from_subscription(subscription)
            send_membership_checkout_email(session: session)
          elsif session.mode.to_s == "payment"
            process_background_check_checkout(session)
          end
        when 'customer.subscription.updated', 'customer.subscription.created'
          subscription = event.data.object
          MembershipSubscriptionService.sync_from_subscription(subscription)
        when 'invoice.paid'
          send_membership_invoice_paid_email(invoice: event.data.object)
        when 'customer.subscription.deleted'
          subscription = event.data.object
          company_profile = CompanyProfile.find_by(stripe_membership_subscription_id: subscription.id)
          technician_profile = TechnicianProfile.find_by(stripe_membership_subscription_id: subscription.id)
          profile = company_profile || technician_profile
          if profile
            profile.update!(
              membership_level: "basic",
              membership_status: subscription.status,
              stripe_membership_subscription_id: nil,
              membership_current_period_end_at: nil
            )
          end
        when 'charge.refunded'
          Rails.logger.info("[stripe webhook] charge.refunded id=#{event.id}")
        else
          Rails.logger.info("[stripe webhook] unhandled type=#{event.type} id=#{event.id}")
        end
      end

      def send_membership_checkout_email(session:)
        return unless session.mode.to_s == "subscription"
        return if session.metadata&.[]("membership_level").blank?

        session_id = session.id.to_s
        return if session_id.blank?
        return if duplicate_membership_event?(event_type: 'checkout.session.completed', object_id: session_id)

        user = User.find_by(stripe_customer_id: session.customer.to_s)
        return if user.blank?

        role = user.company? ? :company : :technician
        tier = MembershipPolicy.normalized_level(session.metadata&.[]('membership_level').to_s.presence || MembershipPolicy.default_slug_for(role), audience: role)
        fee_cents = if role == :company
          MembershipPolicy.rules_for_audience(:company).dig(tier, :fee_cents).to_i
        else
          MembershipPolicy.rules_for_audience(:technician).dig(tier, :fee_cents).to_i
        end
        return unless fee_cents.positive?

        MailDelivery.safe_deliver { UserMailer.membership_checkout_thanks(user, membership_level: tier).deliver_now }
      end

      def process_background_check_checkout(session)
        background_check_id = session.metadata&.[]("background_check_id").to_s
        return if background_check_id.blank?
        check = BackgroundCheck.find_by(id: background_check_id)
        return if check.blank?
        return if check.payment_status.to_s == "paid"

        check.update!(
          payment_status: :paid,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent.to_s.presence,
          paid_at: Time.current
        )
        VerificationEventNotifier.background_payment_completed(check.user, check)
        invitation = BackgroundCheckStartService.launch_checkr_invitation!(check)
        check.update!(provider_invitation_id: invitation["id"]) if invitation["id"].present?
      rescue BackgroundCheckStartService::Error => e
        check&.update!(status: :failed, admin_notes: e.message)
      end

      def send_membership_invoice_paid_email(invoice:)
        invoice_id = invoice.id.to_s
        return if invoice_id.blank?
        return if duplicate_membership_event?(event_type: 'invoice.paid', object_id: invoice_id)

        user = User.find_by(stripe_customer_id: invoice.customer.to_s)
        return if user.blank?
        return unless membership_user?(user)
        return unless invoice.paid

        amount_cents = invoice.amount_paid.to_i
        return if amount_cents <= 0

        line = invoice.lines&.data&.first
        period_start = timestamp_to_time(line&.period&.start)
        period_end = timestamp_to_time(line&.period&.end)
        MailDelivery.safe_deliver do
          UserMailer.membership_invoice_paid_notice(
            user: user,
            amount_cents: amount_cents,
            period_start: period_start,
            period_end: period_end,
            hosted_invoice_url: invoice.hosted_invoice_url,
            invoice_number: invoice.number
          ).deliver_now
        end
      end

      def duplicate_membership_event?(event_type:, object_id:)
        return false if object_id.blank?

        StripeWebhookEvent
          .where(event_type: event_type)
          .where.not(processed_at: nil)
          .where("payload LIKE ?", "%\"id\":\"#{object_id}\"%")
          .exists?
      end

      def timestamp_to_time(value)
        return nil if value.blank?

        Time.zone.at(value.to_i)
      end

      def membership_user?(user)
        user.company? || user.technician?
      end
    end
  end
end
