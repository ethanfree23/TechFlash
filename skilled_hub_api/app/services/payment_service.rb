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
    ledger = JobLedger.for(job)
    return { error: "Job is underfunded; technician payout is blocked." } unless ledger.fully_funded
    return { error: "Technician payout already transferred." } if ledger.transferred_cents.positive?

    existing = job.job_payment_transactions.find_by(transaction_type: :technician_transfer, status: :succeeded)
    return { success: true, payment: payment, transaction: existing } if existing

    accepted_app = job.job_applications.find_by(status: :accepted)
    technician_profile = accepted_app&.technician_profile
    return { error: "No technician to pay" } unless technician_profile
    return { error: "Technician has no Stripe account" } if technician_profile.stripe_account_id.blank?
    unless StripeConnectAccountService.payout_ready?(technician_profile, sync: true)
      return { error: "Technician Stripe Connect account is not ready to receive payouts." }
    end

    payout_amount = ledger.technician_net_payout_cents
    return { error: "No approved payable hours available for payout." } if payout_amount <= 0
    if payout_amount > ledger.net_funded_cents
      return { error: "Payout exceeds funded amount." }
    end

    key = "tf_job_#{job.id}_txn_technician_transfer_r#{job.financial_revision}"
    txn = JobPaymentTransaction.find_or_initialize_by(idempotency_key: key)
    if txn.new_record?
      txn.assign_attributes(
        payment: payment,
        job: job,
        transaction_type: :technician_transfer,
        direction: :outbound,
        amount_cents: payout_amount,
        currency: "usd",
        status: :pending,
        revision: job.financial_revision
      )
      txn.save!
    elsif txn.status_succeeded?
      return { success: true, payment: payment, transaction: txn }
    end

    result = JobStripeOps.transfer!(
      amount_cents: payout_amount,
      destination: technician_profile.stripe_account_id,
      metadata: JobFundingService.stripe_metadata(job, txn),
      transfer_group: job.transfer_group,
      idempotency_key: key
    )
    if result.succeeded?
      txn.update!(status: :succeeded, stripe_transfer_id: result.stripe_id, succeeded_at: Time.current)
      payment.update!(
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
      { success: true, payment: payment, transaction: txn }
    else
      txn.update!(status: :failed, error_message: result.error)
      { error: result.error }
    end
  end
end
