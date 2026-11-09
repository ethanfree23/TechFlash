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
          if webhook_secret_required?
            Rails.logger.error('[stripe webhook] STRIPE_WEBHOOK_SECRET is required in this environment')
            return head :internal_server_error
          end
          Rails.logger.warn('[stripe webhook] STRIPE_WEBHOOK_SECRET not configured — ignoring')
          return head :service_unavailable
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
          reconcile_payment_intent_succeeded(event.data.object)
        when 'payment_intent.processing'
          reconcile_payment_intent_processing(event.data.object)
        when 'payment_intent.payment_failed'
          reconcile_payment_intent_failed(event.data.object)
        when 'setup_intent.succeeded'
          reconcile_setup_intent_succeeded(event.data.object)
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
            audience = company_profile ? :company : :technician
            profile.update!(
              membership_level: MembershipPolicy.default_slug_for(audience),
              membership_status: subscription.status,
              stripe_membership_subscription_id: nil,
              membership_current_period_end_at: nil,
              pending_membership_level: nil
            )
          end
        when 'charge.refunded'
          reconcile_charge_refunded(event.data.object)
        when 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'
          reconcile_charge_dispute(event.data.object, event_type: event.type)
        when 'account.updated'
          account = event.data.object
          profile = TechnicianProfile.find_by(stripe_account_id: account.id)
          StripeConnectAccountService.sync!(profile) if profile
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

      def webhook_secret_required?
        return false if defined?(DemoMode) && DemoMode.enabled?

        Rails.env.production? || Rails.env.to_s == "staging"
      end

      def reconcile_payment_intent_succeeded(pi)
        Job.transaction do
          txn = find_locked_collection_txn(pi)
          next unless txn && !txn.status_succeeded?

          was_initial = txn.initial_job_charge?
          JobFundingService.mark_txn_succeeded!(
            txn,
            stripe_id: pi.id,
            charge_id: pi.latest_charge.to_s.presence,
            payment_method_attrs: payment_method_attrs_from_intent(pi)
          )
          job = Job.lock.find(txn.job_id)
          payment = Payment.lock.find(txn.payment_id)
          payment.update!(status: "held", stripe_payment_intent_id: pi.id, held_at: Time.current) if payment.status == "pending" || payment.status == "failed"
          if was_initial && (job.pending_funding? || job.funding_adjustment_required?)
            JobFundingService.publish!(job)
            JobFundingService.record_revision!(job, source: "posting", transaction: txn) unless job.job_financial_revisions.exists?(revision_number: job.financial_revision)
            MailDelivery.safe_deliver { UserMailer.payment_confirmation_email(job, txn.amount_cents).deliver_now }
            JobAlertDispatcher.dispatch_for_job(job) if job.effectively_open?
          elsif txn.counteroffer_top_up? || txn.final_hours_top_up?
            JobFundingAdjustmentService.after_successful_collection!(job)
          elsif job.funding_adjustment_required?
            job.update!(funding_status: :funded)
          end
        end
      end

      def reconcile_payment_intent_processing(pi)
        Job.transaction do
          txn = find_locked_collection_txn(pi)
          next unless txn
          next if txn.status_succeeded? || txn.status_failed? || txn.status_canceled?

          JobFundingService.mark_txn_processing!(
            txn,
            stripe_id: pi.id,
            charge_id: pi.latest_charge.to_s.presence,
            payment_method_attrs: payment_method_attrs_from_intent(pi)
          )
          job = Job.lock.find(txn.job_id)
          if txn.initial_job_charge? || txn.counteroffer_top_up? || txn.final_hours_top_up?
            attrs = { funding_status: :adjustment_required }
            attrs[:status] = :pending_funding if txn.initial_job_charge? && !job.filled? && !job.finished? && !job.reserved?
            job.update!(attrs)
          end
        end
      end

      def reconcile_payment_intent_failed(pi)
        Job.transaction do
          txn = find_locked_collection_txn(pi)
          next unless txn
          next if txn.status_succeeded?

          txn.update!(
            status: :failed,
            error_message: pi.last_payment_error&.message || "Payment failed",
            **payment_method_attrs_from_intent(pi)
          )
          job = Job.lock.find(txn.job_id)
          payment = Payment.lock.find_by(id: txn.payment_id)
          payment&.update!(status: "failed") if payment&.status == "pending"
          if txn.initial_job_charge? && job.pending_funding?
            job.update!(funding_status: :funding_failed)
          elsif txn.counteroffer_top_up? || txn.final_hours_top_up?
            job.update!(funding_status: :adjustment_required, settlement_status: :settlement_blocked)
          end
        end
      end

      def reconcile_setup_intent_succeeded(setup_intent)
        # Payment methods are stored in Stripe; we only log mandate evidence for audit.
        Rails.logger.info(
          "[stripe webhook] setup_intent.succeeded id=#{setup_intent.id} customer=#{setup_intent.customer} " \
          "payment_method=#{setup_intent.payment_method} status=#{setup_intent.status}"
        )
      end

      def reconcile_charge_dispute(dispute, event_type:)
        charge_id = dispute.charge.to_s.presence
        pi_id = dispute.payment_intent.to_s.presence
        txn = nil
        txn = JobPaymentTransaction.find_by(stripe_charge_id: charge_id) if charge_id
        txn ||= JobPaymentTransaction.company_collections.find_by(stripe_payment_intent_id: pi_id) if pi_id
        return unless txn

        txn.update!(
          dispute_status: dispute.status.to_s.presence || event_type.to_s,
          stripe_dispute_id: dispute.id.to_s,
          metadata_json: txn.metadata_json.to_h.merge(
            "dispute" => {
              "id" => dispute.id.to_s,
              "status" => dispute.status.to_s,
              "reason" => dispute.reason.to_s,
              "amount" => dispute.amount,
              "event_type" => event_type.to_s,
              "updated_at" => Time.current.iso8601
            }
          )
        )
        Rails.logger.warn(
          "[stripe webhook] dispute job_id=#{txn.job_id} txn_id=#{txn.id} dispute=#{dispute.id} status=#{dispute.status}"
        )
      end

      def find_locked_collection_txn(pi)
        txn = JobPaymentTransaction.lock.find_by(stripe_payment_intent_id: pi.id)
        txn ||= JobPaymentTransaction.lock.find_by(id: pi.metadata&.[]("transaction_id").to_i) if pi.metadata&.[]("transaction_id").present?
        txn
      end

      def payment_method_attrs_from_intent(pi)
        pm_id = pi.payment_method.to_s.presence
        return {} if pm_id.blank?

        JobStripeOps.payment_method_display(pm_id).transform_keys do |key|
          key == :payment_method_id ? :stripe_payment_method_id : key
        end
      rescue StandardError
        { stripe_payment_method_id: pm_id }
      end

      def reconcile_charge_refunded(charge)
        refunds = charge.refunds&.data || []
        refunds.each do |refund|
          next if JobPaymentTransaction.exists?(stripe_refund_id: refund.id)

          pi_id = charge.payment_intent.to_s.presence
          source = JobPaymentTransaction.status_succeeded.company_collections.find_by(stripe_payment_intent_id: pi_id)
          source ||= JobPaymentTransaction.find_by(stripe_charge_id: charge.id)
          next unless source

          JobPaymentTransaction.create!(
            payment: source.payment,
            job: source.job,
            transaction_type: :refund,
            direction: :outbound,
            amount_cents: refund.amount.to_i,
            currency: refund.currency || "usd",
            status: :succeeded,
            stripe_refund_id: refund.id,
            stripe_charge_id: charge.id,
            stripe_payment_intent_id: pi_id,
            idempotency_key: "tf_stripe_refund_#{refund.id}",
            revision: source.job.financial_revision,
            succeeded_at: Time.current,
            metadata_json: { "source" => "stripe_webhook" }
          )
        end
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
