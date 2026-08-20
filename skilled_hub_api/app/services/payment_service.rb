# frozen_string_literal: true

class PaymentService
  RELEASE_HOURS = JobSettlementService::RELEASE_HOURS

  class PaymentError < StandardError; end

  def self.company_has_payment_method?(user)
    return true if defined?(DemoMode) && DemoMode.enabled?

    return false if user.blank?
    return false if Stripe.api_key.blank?

    customer_id = StripeCustomerService.validate_or_clear_customer_id!(user)
    return false if customer_id.blank?

    JobFundingService.default_payment_method_id(customer_id).present?
  rescue Stripe::StripeError
    false
  end

  def self.refund_payment(job)
    JobFundingAdjustmentService.refund_unfilled_job!(job)
  end

  def self.stripe_earnings_cents_for(technician_profile)
    return nil if technician_profile.blank? || technician_profile.stripe_account_id.blank?
    return nil if Stripe.api_key.blank?

    total = 0
    has_more = true
    starting_after = nil

    while has_more
      params = {
        destination: technician_profile.stripe_account_id,
        limit: 100
      }
      params[:starting_after] = starting_after if starting_after.present?

      list = Stripe::Transfer.list(params)
      list.data.each do |t|
        next if t.reversed

        amount_reversed = t.respond_to?(:amount_reversed) ? (t.amount_reversed || 0) : 0
        total += (t.amount || 0) - amount_reversed
      end
      has_more = list.has_more
      starting_after = list.data.last&.id if has_more && list.data.any?
    end

    total
  rescue Stripe::StripeError
    nil
  end

  def self.release_if_eligible(job)
    JobSettlementService.settle_and_release_if_eligible!(job)
  end

  def self.release_eligible?(job)
    JobSettlementService.release_eligible?(job)
  end

  def self.release_to_technician(payment)
    return { error: "No payment header" } if payment.blank?

    job = payment.job
    payout_amount = nil
    technician_profile = nil
    key = nil
    txn = nil
    early = nil

    Job.transaction do
      locked_job = Job.lock.find(job.id)
      if locked_job.technician_commission_percent_snapshot.nil? &&
          !locked_job.job_financial_revisions.where.not(technician_commission_percent: nil).exists?
        early = { error: "Technician commission snapshot is missing; refusing to transfer." }
        next
      end

      begin
        ledger = JobLedger.for(locked_job)
      rescue JobLedger::MissingCommissionSnapshotError => e
        early = { error: e.message }
        next
      end
      JobLedger.new(locked_job).technician_commission_percent!

      unless ledger.fully_funded
        early = { error: "Job is underfunded; technician payout is blocked." }
        next
      end
      if ledger.transferred_cents.positive?
        early = { error: "Technician payout already transferred." }
        next
      end
      if ledger.technician_net_payout_cents.nil?
        early = { error: "Technician commission snapshot is missing; refusing to transfer." }
        next
      end

      existing = locked_job.job_payment_transactions.find_by(transaction_type: :technician_transfer, status: :succeeded)
      if existing
        early = { success: true, payment: payment, transaction: existing }
        next
      end

      accepted_app = locked_job.job_applications.find_by(status: :accepted)
      technician_profile = accepted_app&.technician_profile
      unless technician_profile
        early = { error: "No technician to pay" }
        next
      end
      if technician_profile.stripe_account_id.blank?
        early = { error: "Technician has no Stripe account" }
        next
      end
      unless StripeConnectAccountService.payout_ready?(technician_profile, sync: true)
        early = { error: "Technician Stripe Connect account is not ready to receive payouts." }
        next
      end

      payout_amount = ledger.technician_net_payout_cents
      if payout_amount.to_i <= 0
        early = { error: "No approved payable hours available for payout." }
        next
      end
      if payout_amount > ledger.net_funded_cents
        early = { error: "Payout exceeds funded amount." }
        next
      end

      key = "tf_job_#{locked_job.id}_txn_technician_transfer_r#{locked_job.financial_revision}"
      txn = JobPaymentTransaction.lock.find_or_initialize_by(idempotency_key: key)
      if txn.new_record?
        txn.assign_attributes(
          payment: payment,
          job: locked_job,
          transaction_type: :technician_transfer,
          direction: :outbound,
          amount_cents: payout_amount,
          currency: "usd",
          status: :pending,
          revision: locked_job.financial_revision
        )
        txn.save!
      elsif txn.status_succeeded?
        early = { success: true, payment: payment, transaction: txn }
      end
    end
    return early if early

    result = JobStripeOps.transfer!(
      amount_cents: payout_amount,
      destination: technician_profile.stripe_account_id,
      metadata: JobFundingService.stripe_metadata(job, txn),
      transfer_group: job.transfer_group,
      idempotency_key: key
    )

    Job.transaction do
      locked_txn = JobPaymentTransaction.lock.find(txn.id)
      locked_payment = Payment.lock.find(payment.id)
      if locked_txn.status_succeeded?
        return { success: true, payment: locked_payment, transaction: locked_txn }
      end

      if result.succeeded?
        locked_txn.update!(status: :succeeded, stripe_transfer_id: result.stripe_id, succeeded_at: Time.current)
        locked_payment.update!(
          status: "released",
          stripe_transfer_id: result.stripe_id,
          released_at: Time.current,
          amount_cents: payout_amount
        )
        TimeEntry.where(job_id: job.id, status: TimeEntry.statuses[:approved]).update_all(
          status: TimeEntry.statuses[:paid],
          paid_at: Time.current,
          updated_at: Time.current
        )
        MailDelivery.safe_deliver { UserMailer.payment_received_email(job, payout_amount).deliver_now }
        { success: true, payment: locked_payment, transaction: locked_txn }
      else
        locked_txn.update!(status: :failed, error_message: result.error)
        { error: result.error }
      end
    end
  rescue JobLedger::MissingCommissionSnapshotError => e
    { error: e.message }
  end
end
