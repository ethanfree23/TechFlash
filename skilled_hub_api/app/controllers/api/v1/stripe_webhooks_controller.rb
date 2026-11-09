# frozen_string_literal: true

module Api
  module V1
    # Does not inherit ApplicationController — avoids JSON body rewind / token auth.
    class StripeWebhooksController < ActionController::API
      SUBSCRIPTION_EVENT_TYPES = %w[
        customer.subscription.created
        customer.subscription.updated
        customer.subscription.deleted
      ].freeze

      # Events delivered for a connected account (event.account present) describe that account only.
      # They must never reach the platform-side ledger/membership handlers.
      CONNECTED_ACCOUNT_EVENT_TYPES = %w[account.updated].freeze

      def create
        payload = request.body.read
        sig_header = request.env['HTTP_STRIPE_SIGNATURE']
        secrets = webhook_signing_secrets

        if secrets.empty?
          if webhook_secret_required?
            Rails.logger.error('[stripe webhook] STRIPE_WEBHOOK_SECRET is required in this environment')
            return head :internal_server_error
          end
          Rails.logger.warn('[stripe webhook] STRIPE_WEBHOOK_SECRET not configured — ignoring')
          return head :service_unavailable
        end

        event = verified_event(payload, sig_header, secrets)
        return head :bad_request if event.nil?

        existing = StripeWebhookEvent.find_by(stripe_event_id: event.id)
        return head :ok if existing&.processed_at.present?

        # Work that calls external providers (Checkr) is deferred until the ledger/payment state
        # below is committed, so a provider failure can never roll back a verified payment.
        @after_commit_steps = []

        StripeWebhookEvent.transaction do
          rec = StripeWebhookEvent.lock.find_or_initialize_by(stripe_event_id: event.id)
          unless rec.processed_at.present?
            rec.event_type = event.type
            rec.payload = payload
            rec.save!
            process_event(event)
            rec.update!(processed_at: Time.current) if @after_commit_steps.empty?
          end
        end

        if @after_commit_steps.any?
          # The event stays unprocessed until every deferred step succeeds. A failure returns 500 so
          # Stripe redelivers (there is no durable job queue in this app: Active Job is inline); the
          # retry finds payment already recorded and only the missing step left to do.
          @after_commit_steps.each(&:call)
          StripeWebhookEvent.where(stripe_event_id: event.id).update_all(processed_at: Time.current)
        end

        head :ok
      rescue BackgroundCheckFulfillmentService::Error => e
        Rails.logger.error("[stripe webhook] deferred fulfillment failed event=#{event&.id} error=#{e.class}; returning 500 for Stripe retry")
        head :internal_server_error
      end

      private

      # Platform destination secret first, then the optional Connect ("events on connected accounts")
      # destination secret. Only non-blank values are candidates; nothing is ever defaulted.
      def webhook_signing_secrets
        platform = ENV['STRIPE_WEBHOOK_SECRET'].presence ||
          Rails.application.credentials.dig(:stripe, :webhook_secret).presence
        connect = ENV['STRIPE_CONNECT_WEBHOOK_SECRET'].presence ||
          Rails.application.credentials.dig(:stripe, :connect_webhook_secret).presence
        [platform, connect].map { |s| s.to_s.strip.presence }.compact.uniq
      end

      def verified_event(payload, sig_header, secrets)
        last_error = nil
        secrets.each do |secret|
          return Stripe::Webhook.construct_event(payload, sig_header, secret)
        rescue Stripe::SignatureVerificationError => e
          last_error = e
        rescue JSON::ParserError => e
          # Signature matched but the body is not JSON; no other secret can fix that.
          last_error = e
          break
        end
        # Class only: a JSON::ParserError message can echo payload fragments.
        Rails.logger.warn("[stripe webhook] verify failed: #{last_error.class} secrets_tried=#{secrets.size}")
        nil
      end

      def process_event(event)
        connected_account_id = event["account"].to_s.presence
        if connected_account_id && !CONNECTED_ACCOUNT_EVENT_TYPES.include?(event.type)
          Rails.logger.info("[stripe webhook] ignoring connected-account event type=#{event.type} id=#{event.id}")
          return
        end

        case event.type
        when 'payment_intent.succeeded'
          reconcile_payment_intent_succeeded(event.data.object)
        when 'payment_intent.payment_failed'
          reconcile_payment_intent_failed(event.data.object)
        when 'checkout.session.completed'
          session = event.data.object
          if session.mode.to_s == "subscription"
            subscription_id = session.subscription.to_s
            return if subscription_id.blank?

            subscription = Stripe::Subscription.retrieve(subscription_id)
            MembershipSubscriptionService.sync_from_subscription(subscription)
            send_membership_checkout_email(session: session)
          elsif session.mode.to_s == "payment"
            # Delayed methods (e.g. ACH) complete Checkout with payment_status "unpaid"; the paid
            # guard inside fulfillment defers those to checkout.session.async_payment_succeeded.
            fulfill_background_check_checkout(session, event_type: event.type)
          end
        when 'checkout.session.async_payment_succeeded'
          session = event.data.object
          fulfill_background_check_checkout(session, event_type: event.type) if session.mode.to_s == "payment"
        when 'checkout.session.async_payment_failed'
          session = event.data.object
          record_background_check_async_payment_failed(session) if session.mode.to_s == "payment"
        when 'customer.subscription.updated', 'customer.subscription.created'
          subscription = event.data.object
          return if stale_subscription_event?(event, subscription.id)

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
            # Same validation-safe targeted write as MembershipSubscriptionService.sync_from_subscription.
            profile.update_columns(
              membership_level: MembershipPolicy.default_slug_for(audience),
              membership_status: subscription.status,
              stripe_membership_subscription_id: nil,
              membership_current_period_end_at: nil,
              pending_membership_level: nil,
              updated_at: Time.current
            )
          end
        when 'charge.refunded'
          reconcile_charge_refunded(event.data.object)
        when 'account.updated'
          sync_connected_account(event, connected_account_id: connected_account_id)
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

      # Single path for checkout.session.completed and checkout.session.async_payment_succeeded.
      #
      # Phase 1 (inside the webhook transaction): record the verified payment, idempotently, under a
      # row lock. Phase 2 (after commit, see #create): create the Checkr invitation via
      # BackgroundCheckFulfillmentService, which is keyed on provider_invitation_id rather than on
      # payment state, so a Checkr failure leaves a paid, retryable check and a redelivered event
      # (or the retry rake task) finishes fulfillment without a second invitation or charge.
      def fulfill_background_check_checkout(session, event_type:)
        background_check_id = session.metadata&.[]("background_check_id").to_s
        return if background_check_id.blank?

        unless session.payment_status.to_s == "paid"
          Rails.logger.info(
            "[stripe webhook] background check checkout not paid type=#{event_type} session=#{session.id} " \
            "background_check_id=#{background_check_id} payment_status=#{session.payment_status}"
          )
          return
        end

        check = nil
        newly_paid = false
        BackgroundCheck.transaction do
          check = BackgroundCheck.lock.find_by(id: background_check_id)
          next if check.blank?

          unless check.payment_status_paid?
            check.update!(
              payment_status: :paid,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent.to_s.presence,
              paid_at: Time.current
            )
            newly_paid = true
          end
        end
        return if check.blank?

        @after_commit_steps << lambda do
          notify_background_payment_completed(check) if newly_paid
          outcome = BackgroundCheckFulfillmentService.ensure_invitation!(check.id)
          Rails.logger.info("[stripe webhook] background check fulfillment type=#{event_type} background_check_id=#{check.id} outcome=#{outcome}")
        end
      end

      # Notification is best-effort and must never block or roll back fulfillment.
      def notify_background_payment_completed(check)
        VerificationEventNotifier.background_payment_completed(check.user, check)
      rescue StandardError => e
        Rails.logger.warn("[stripe webhook] background payment notification failed background_check_id=#{check.id} error=#{e.class}")
      end

      # Delayed payment failed after Checkout completed: never launch Checkr. A still-pending check is
      # marked payment failed so the technician can start over; a paid check is never downgraded.
      def record_background_check_async_payment_failed(session)
        background_check_id = session.metadata&.[]("background_check_id").to_s
        outcome = "no_background_check"

        if background_check_id.present?
          BackgroundCheck.transaction do
            check = BackgroundCheck.lock.find_by(id: background_check_id)
            next if check.blank?

            if check.payment_status_paid?
              outcome = "already_paid_ignored"
            elsif check.payment_status_pending? &&
                  (check.stripe_checkout_session_id.blank? || check.stripe_checkout_session_id == session.id.to_s)
              check.update!(payment_status: :failed)
              outcome = "marked_payment_failed"
            else
              outcome = "unchanged"
            end
          end
        end

        Rails.logger.warn(
          "[stripe webhook] checkout async payment failed session=#{session.id} " \
          "background_check_id=#{background_check_id.presence || '-'} outcome=#{outcome}"
        )
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

      # Stripe does not guarantee ordering. A subscription event is stale when the subscription was
      # already deleted (terminal in Stripe) or when a newer event for the same subscription has
      # already been processed; applying it could re-grant a canceled tier.
      def stale_subscription_event?(event, subscription_id)
        sid = subscription_id.to_s
        return false if sid.blank?

        processed = StripeWebhookEvent
          .where(event_type: SUBSCRIPTION_EVENT_TYPES)
          .where.not(processed_at: nil)
          .where("payload LIKE ?", "%\"id\":\"#{sid}\"%")

        if processed.where(event_type: 'customer.subscription.deleted').exists?
          Rails.logger.info("[stripe webhook] ignoring #{event.type} for deleted subscription event=#{event.id}")
          return true
        end

        event_created = event["created"].to_i
        return false unless event_created.positive?

        newer = processed.pluck(:payload).any? do |raw|
          JSON.parse(raw)["created"].to_i > event_created
        rescue JSON::ParserError
          false
        end
        Rails.logger.info("[stripe webhook] ignoring out-of-order #{event.type} event=#{event.id}") if newer
        newer
      end

      def webhook_secret_required?
        return false if defined?(DemoMode) && DemoMode.enabled?

        Rails.env.production? || Rails.env.to_s == "staging"
      end

      def sync_connected_account(event, connected_account_id:)
        account = event.data.object
        account_id = account.id.to_s
        return if account_id.blank?

        if connected_account_id && connected_account_id != account_id
          Rails.logger.warn("[stripe webhook] account.updated account mismatch event=#{event.id}")
          return
        end

        profile = TechnicianProfile.find_by(stripe_account_id: account_id)
        StripeConnectAccountService.sync!(profile) if profile
      end

      def reconcile_payment_intent_succeeded(pi)
        Job.transaction do
          txn = JobPaymentTransaction.lock.find_by(stripe_payment_intent_id: pi.id)
          txn ||= JobPaymentTransaction.lock.find_by(id: pi.metadata&.[]("transaction_id").to_i) if pi.metadata&.[]("transaction_id").present?
          next unless txn && !txn.status_succeeded?

          JobFundingService.mark_txn_succeeded!(txn, stripe_id: pi.id, charge_id: pi.latest_charge.to_s.presence)
          job = Job.lock.find(txn.job_id)
          payment = Payment.lock.find(txn.payment_id)
          payment.update!(status: "held", stripe_payment_intent_id: pi.id, held_at: Time.current) if payment.status == "pending" || payment.status == "failed"
          JobFundingService.publish!(job) if txn.initial_job_charge? && job.pending_funding?
          job.update!(funding_status: :funded) if job.funding_adjustment_required?
        end
      end

      def reconcile_payment_intent_failed(pi)
        txn = JobPaymentTransaction.find_by(stripe_payment_intent_id: pi.id)
        txn&.update!(status: :failed, error_message: pi.last_payment_error&.message)
      end

      # charge.refunded carries the Charge (with every refund so far), not a single Refund.
      def reconcile_charge_refunded(charge)
        refunds_for_charge(charge).each do |refund|
          reconcile_refund!(charge, refund)
        end
      end

      # Newer API versions omit `refunds` from the Charge payload (or truncate it); fetch from Stripe then.
      def refunds_for_charge(charge)
        collection = charge["refunds"]
        data = collection && collection["data"]
        return Array(data) if !data.nil? && !collection["has_more"]

        Stripe::Refund.list({ charge: charge.id, limit: 100 }).auto_paging_each.to_a
      end

      def reconcile_refund!(charge, refund)
        pi_id = charge.payment_intent.to_s.presence

        JobPaymentTransaction.transaction do
          # 1) Already linked (by us or by an earlier delivery): only sync status, never insert.
          existing = JobPaymentTransaction.lock.find_by(stripe_refund_id: refund.id)
          if existing
            apply_stripe_refund_status!(existing, refund)
            next
          end

          # 2) App-initiated refund whose stripe_refund_id has not been persisted yet (race with
          #    JobFundingService.refund_slice!): attach to the pending txn instead of inserting.
          next if link_app_initiated_refund!(refund, charge: charge, pi_id: pi_id)

          # 3) External refund (Dashboard/API outside the app): record it against the collection.
          source = JobPaymentTransaction.status_succeeded.company_collections.find_by(stripe_payment_intent_id: pi_id)
          source ||= JobPaymentTransaction.find_by(stripe_charge_id: charge.id)
          unless source
            Rails.logger.warn("[stripe webhook] refund without matching collection refund=#{refund.id} charge=#{charge.id}")
            next
          end

          create_external_refund_txn!(source: source, charge: charge, refund: refund, pi_id: pi_id)
        end
      end

      def link_app_initiated_refund!(refund, charge:, pi_id:)
        txn_id = refund["metadata"]&.[]("transaction_id").to_s
        return false unless txn_id.match?(/\A\d+\z/)

        txn = JobPaymentTransaction.lock.find_by(id: txn_id.to_i)
        if txn.nil?
          Rails.logger.warn("[stripe webhook] refund metadata points to unknown txn refund=#{refund.id} transaction_id=#{txn_id}")
          return false
        end

        mismatch = refund_txn_mismatch(txn, refund: refund, charge: charge, pi_id: pi_id)
        if mismatch
          Rails.logger.warn(
            "[stripe webhook] refund metadata mismatch refund=#{refund.id} transaction_id=#{txn.id} reason=#{mismatch}"
          )
          return false
        end

        attrs = { stripe_refund_id: refund.id }
        attrs[:stripe_charge_id] = charge.id if txn.stripe_charge_id.blank?
        attrs[:stripe_payment_intent_id] = pi_id if txn.stripe_payment_intent_id.blank? && pi_id
        txn.assign_attributes(attrs)
        apply_stripe_refund_status!(txn, refund)
        true
      end

      # Returns nil when the Stripe refund is consistent with the ledger txn, else a short reason.
      def refund_txn_mismatch(txn, refund:, charge:, pi_id:)
        return "type" unless JobPaymentTransaction::REFUND_TYPES.include?(txn.transaction_type.to_s)
        return "refund_id_conflict" if txn.stripe_refund_id.present? && txn.stripe_refund_id != refund.id
        return "amount" unless txn.amount_cents.to_i == refund.amount.to_i
        return "currency" unless txn.currency.to_s.casecmp?(refund.currency.to_s)

        txn_pi = txn.stripe_payment_intent_id.presence || txn.metadata_json.to_h["payment_intent_id"].presence
        txn_charge = txn.stripe_charge_id.presence
        if txn_pi.present? || txn_charge.present?
          pi_ok = txn_pi.present? && pi_id.present? && txn_pi == pi_id
          charge_ok = txn_charge.present? && txn_charge == charge.id.to_s
          return "parent_charge" unless pi_ok || charge_ok
        else
          same_job = JobPaymentTransaction
            .where(job_id: txn.job_id)
            .where("stripe_payment_intent_id = ? OR stripe_charge_id = ?", pi_id.to_s, charge.id.to_s)
            .exists?
          return "parent_charge" unless same_job
        end

        nil
      end

      # Ledger status follows the real Stripe refund status; pending/failed are never success.
      # A txn the app already settled as succeeded is not downgraded here (logged for review).
      def apply_stripe_refund_status!(txn, refund)
        case refund["status"].to_s
        when "succeeded"
          unless txn.status_succeeded?
            txn.status = :succeeded
            txn.succeeded_at ||= Time.current
          end
        when "failed", "canceled"
          if txn.status_succeeded?
            Rails.logger.warn("[stripe webhook] stripe refund #{refund['status']} but ledger txn succeeded refund=#{refund.id} transaction_id=#{txn.id}")
          else
            txn.status = :failed
            txn.error_message = refund["failure_reason"].presence || "Stripe refund #{refund['status']}"
          end
        end
        txn.save! if txn.changed?
      end

      def create_external_refund_txn!(source:, charge:, refund:, pi_id:)
        status =
          case refund["status"].to_s
          when "succeeded" then :succeeded
          when "failed", "canceled" then :failed
          else :pending
          end

        JobPaymentTransaction.transaction(requires_new: true) do
          JobPaymentTransaction.create!(
            payment: source.payment,
            job: source.job,
            transaction_type: :refund,
            direction: :outbound,
            amount_cents: refund.amount.to_i,
            currency: refund.currency.presence || "usd",
            status: status,
            stripe_refund_id: refund.id,
            stripe_charge_id: charge.id,
            stripe_payment_intent_id: pi_id,
            idempotency_key: "tf_stripe_refund_#{refund.id}",
            revision: source.job.financial_revision,
            succeeded_at: (Time.current if status == :succeeded),
            error_message: (refund["failure_reason"].presence if status == :failed),
            metadata_json: { "source" => "stripe_webhook", "stripe_refund_status" => refund["status"].to_s }
          )
        end
      rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid => e
        # Row locks cannot serialize two inserts for a refund nobody has recorded yet; the UNIQUE
        # index on idempotency_key does (stripe_refund_id is indexed but not unique). Depending on
        # when the winner committed, the loser sees either the DB constraint (RecordNotUnique) or
        # the model's uniqueness validation (RecordInvalid). Either way: treat it as a duplicate
        # delivery, re-read the winner's row and reconcile its status.
        raise if e.is_a?(ActiveRecord::RecordInvalid) && e.record.errors[:idempotency_key].blank?

        Rails.logger.info("[stripe webhook] concurrent refund insert refund=#{refund.id} (#{e.class}); reconciling existing row")
        existing = JobPaymentTransaction.lock.find_by(idempotency_key: "tf_stripe_refund_#{refund.id}") ||
                   JobPaymentTransaction.lock.find_by(stripe_refund_id: refund.id)
        return nil if existing.nil?

        existing.stripe_refund_id = refund.id if existing.stripe_refund_id.blank?
        apply_stripe_refund_status!(existing, refund)
        existing
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
