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
      # ACH safety: never transfer while a company collection/refund is still processing,
      # or while a funding charge is under dispute / return review.
      if locked_job.job_payment_transactions.company_collections.status_processing.exists?
        early = { error: "Company ACH payment is still processing; technician payout is blocked." }
        next
      end
      if locked_job.job_payment_transactions.company_refunds.status_processing.exists? ||
          locked_job.job_payment_transactions.company_refunds.status_pending.exists?
        early = { error: "Company refund is still pending; technician payout is blocked." }
        next
      end
      disputed = locked_job.job_payment_transactions.company_collections.status_succeeded.select(&:disputed?)
      if disputed.any?
        early = { error: "Company payment is disputed or returned; technician payout is blocked until resolved." }
        next
      end
      if defined?(PaymentRiskEvent) && PaymentRiskEvent.open_for_job?(locked_job)
        early = { error: "Unresolved financial risk on this job; technician payout is blocked pending admin review." }
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

    source_charge_id = source_charge_for_transfer(job, amount_cents: payout_amount)
    result = JobStripeOps.transfer!(
      amount_cents: payout_amount,
      destination: technician_profile.stripe_account_id,
      metadata: JobFundingService.stripe_metadata(job, txn).merge(
        "source_charge_id" => source_charge_id.to_s,
        "source_transaction_mode" => source_charge_id.present? ? "single_charge" : "platform_balance"
      ),
      transfer_group: job.transfer_group,
      idempotency_key: key,
      source_transaction: source_charge_id
    )

    Job.transaction do
      locked_txn = JobPaymentTransaction.lock.find(txn.id)
      locked_payment = Payment.lock.find(payment.id)
      if locked_txn.status_succeeded?
        return { success: true, payment: locked_payment, transaction: locked_txn }
      end

      if result.succeeded?
        locked_txn.update!(
          status: :succeeded,
          stripe_transfer_id: result.stripe_id,
          source_charge_id: source_charge_id,
          bank_payout_status: "unknown",
          succeeded_at: Time.current,
          metadata_json: locked_txn.metadata_json.to_h.merge(
            "source_transaction" => source_charge_id,
            "bank_payout_status" => "unknown"
          )
        )
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
        PaymentRiskEvent.create!(
          job: job,
          job_payment_transaction: locked_txn,
          risk_kind: "transfer_executed",
          investigation_status: "resolved",
          investigation_required: false,
          amount_cents: payout_amount,
          currency: "usd",
          stripe_transfer_id: result.stripe_id,
          stripe_connected_account_id: technician_profile.stripe_account_id,
          stripe_charge_id: source_charge_id,
          bank_payout_status: "unknown",
          admin_note: "Transfer created on Stripe Connect. Bank payout status unknown (not proven).",
          metadata_json: { "note" => "transfer_executed_is_not_bank_payout" },
          detected_at: Time.current,
          resolved_at: Time.current
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

  # Prefer source_transaction only for a demonstrably single-charge funded job with
  # sufficient unallocated Charge funds. Multi-charge / ambiguous → Option B (nil).
  # source_transaction must be a Charge ID (ch_...), never a PaymentIntent ID.
  def self.source_charge_for_transfer(job, amount_cents: nil)
    source_transaction_decision(job, amount_cents: amount_cents)[:charge_id]
  end

  # Returns { charge_id:, mode:, reason: } — charge_id nil means platform-balance (Option B).
  def self.source_transaction_decision(job, amount_cents: nil)
    collections = job.job_payment_transactions.company_collections.status_succeeded.order(:id).to_a
    if collections.empty?
      return { charge_id: nil, mode: "platform_balance", reason: "no_succeeded_collections" }
    end

    # Fail closed: every succeeded collection must carry a real Charge ID.
    if collections.any? { |t| t.stripe_charge_id.to_s.strip.blank? }
      return { charge_id: nil, mode: "platform_balance", reason: "collection_missing_charge_id" }
    end

    charge_ids = collections.map { |t| t.stripe_charge_id.to_s.strip }.uniq
    if charge_ids.size != 1
      return { charge_id: nil, mode: "platform_balance", reason: "multiple_source_charges" }
    end

    charge_id = charge_ids.first
    unless charge_id.start_with?("ch_")
      return { charge_id: nil, mode: "platform_balance", reason: "invalid_charge_id_shape" }
    end

    currencies = collections.map { |t| t.currency.to_s.downcase.presence || "usd" }.uniq
    if currencies.size != 1 || currencies.first != "usd"
      return { charge_id: nil, mode: "platform_balance", reason: "currency_mismatch" }
    end

    collected = collections.sum { |t| t.amount_cents.to_i }
    reserved_refunds = job.job_payment_transactions.company_refunds
      .where(status: [
        JobPaymentTransaction.statuses[:succeeded],
        JobPaymentTransaction.statuses[:pending],
        JobPaymentTransaction.statuses[:processing],
        JobPaymentTransaction.statuses[:requires_action]
      ])
      .sum(:amount_cents).to_i

    transferred = job.job_payment_transactions
      .where(transaction_type: JobPaymentTransaction.transaction_types[:technician_transfer])
      .where(status: [
        JobPaymentTransaction.statuses[:succeeded],
        JobPaymentTransaction.statuses[:pending],
        JobPaymentTransaction.statuses[:processing]
      ])
      .sum(:amount_cents).to_i

    allocatable = collected - reserved_refunds - transferred
    planned = amount_cents.nil? ? allocatable : amount_cents.to_i
    if planned <= 0
      return { charge_id: nil, mode: "platform_balance", reason: "non_positive_transfer_amount" }
    end
    if planned > allocatable
      return { charge_id: nil, mode: "platform_balance", reason: "insufficient_allocatable_source" }
    end

    { charge_id: charge_id, mode: "single_charge", reason: "ok", allocatable_cents: allocatable }
  end
end
