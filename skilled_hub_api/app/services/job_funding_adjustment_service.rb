# frozen_string_literal: true

class JobFundingAdjustmentService
  def self.apply_accepted_terms!(job:, hourly_rate_cents:, hours_per_day:, days:)
    labor = JobMoney.labor_cents(
      hourly_rate_cents: hourly_rate_cents,
      hours_per_day: hours_per_day,
      days: days,
      fallback_cents: job.price_cents.to_i
    )
    job.assign_attributes(
      hourly_rate_cents: hourly_rate_cents,
      hours_per_day: hours_per_day,
      days: days,
      agreed_hourly_rate_cents: hourly_rate_cents,
      estimated_hours: JobMoney.estimated_hours(hours_per_day, days),
      agreed_labor_cents: labor,
      financial_revision: job.financial_revision.to_i + 1
    )
    job.save!
    job
  end

  def self.reconcile!(job, source:, transaction_type_prefix:)
    # Historical posting exemption requires the persisted per-job marker only.
    # Must NOT consult live company.job_funding_waived, and must NOT invent waiver
    # authorization from inconsistent funded-without-cash stamps (those need admin
    # review). Granting the company flag must not skip charges on prior unpaid jobs;
    # revoking it must not charge jobs that already carry posted_under_funding_waiver.
    if job.historically_funding_exempt?
      # Keep cash :funded only when verified collections already cover required;
      # otherwise remain financially unfunded with the exemption marker preserved.
      attrs =
        begin
          ledger = JobLedger.for(job)
          if ledger.fully_funded && ledger.net_funded_cents.positive?
            { funding_status: :funded }
          else
            { funding_status: :unfunded, posted_under_funding_waiver: true }
          end
        rescue JobLedger::MissingCommissionSnapshotError
          { funding_status: :unfunded, posted_under_funding_waiver: true }
        end
      job.update!(attrs)
      JobFundingService.record_revision!(job, source: source)
      return { success: true, job: job, waived: true }
    end

    begin
      ledger = JobLedger.for(job)
    rescue JobLedger::MissingCommissionSnapshotError => e
      return { success: false, error: e.message, job: job }
    end
    revision = job.financial_revision

    if ledger.amount_due_cents.positive?
      type = "#{transaction_type_prefix}_top_up"
      result = JobFundingService.collect!(
        job: job,
        amount_cents: ledger.amount_due_cents,
        transaction_type: type,
        revision: revision
      )
      if result[:success]
        job.update!(funding_status: :funded)
        JobFundingService.record_revision!(job, source: source, transaction: result[:transaction])
        { success: true, job: job, transaction: result[:transaction] }
      elsif result[:requires_action]
        job.update!(funding_status: :adjustment_required)
        { success: false, requires_action: true, client_secret: result[:client_secret], job: job, error: "Additional payment is required to accept these terms." }
      elsif result[:processing]
        job.update!(funding_status: :adjustment_required)
        {
          success: false,
          processing: true,
          job: job,
          transaction: result[:transaction],
          error: "ACH payment is processing. These terms will apply when the bank debit succeeds."
        }
      elsif result[:outcome_unknown]
        job.update!(funding_status: :adjustment_required)
        {
          success: false,
          outcome_unknown: true,
          job: job,
          transaction: result[:transaction],
          error: "The payment result is unconfirmed. These terms will apply once the payment is reconciled; do not retry."
        }
      else
        job.update!(funding_status: :adjustment_required)
        { success: false, error: result[:error] || "Could not collect the additional amount.", job: job }
      end
    elsif ledger.amount_refundable_cents.positive?
      type = "#{transaction_type_prefix}_refund"
      result = JobFundingService.refund_delta!(
        job: job,
        amount_cents: ledger.amount_refundable_cents,
        transaction_type: type,
        revision: revision
      )
      if result[:success]
        job.update!(funding_status: :funded)
        JobFundingService.record_revision!(job, source: source, transaction: result[:transaction])
        { success: true, job: job, transaction: result[:transaction] }
      elsif result[:processing] || result[:pending]
        job.update!(funding_status: :adjustment_required)
        {
          success: false,
          pending: true,
          job: job,
          transaction: result[:transaction],
          error: "Refund is pending. Settlement will complete when Stripe finalizes the refund."
        }
      else
        { success: false, error: result[:error] || "Could not refund the difference.", job: job }
      end
    else
      job.update!(funding_status: :funded)
      JobFundingService.record_revision!(job, source: source)
      { success: true, job: job }
    end
  end

  def self.after_successful_collection!(job)
    job.update!(funding_status: :funded)
    JobFundingService.record_revision!(job, source: "collection_confirmed")
  end

  # Company-initiated collect of remaining required funding after waived publish.
  # Does NOT auto-debit: caller must pass confirmed_amount_cents matching ledger due
  # and confirmed_payment_method_id matching the company's default PM.
  # Bypasses historically_funding_exempt? short-circuit (that path is for counteroffers).
  # Keeps posted_under_funding_waiver marker; stamps :funded only on succeeded cash.
  # ACH processing leaves funding_status=adjustment_required (not funded).
  #
  # Concurrency: locks the job row, re-reads the ledger shortfall inside the lock, and
  # refuses a second debit when any post_publish_top_up is already in-flight — even if
  # concurrent callers pass different revision/amount/idempotency identities.
  # Launch dependency (Task B): C-1 ambiguous PI create → outcome_unknown (no re-debit);
  # C-2 processing webhook recovers failed/unknown rows missing PI id.
  def self.collect_remaining!(job, confirmed_amount_cents:, confirmed_payment_method_id:, source: "post_publish_fund")
    unless job.priced?
      return { success: false, error: "Unpriced jobs do not require funding.", job: job }
    end

    due = nil
    locked_job = nil
    early = nil

    Job.transaction do
      locked_job = Job.lock.find(job.id)

      begin
        ledger = JobLedger.for(locked_job)
      rescue JobLedger::MissingCommissionSnapshotError => e
        early = { success: false, error: e.message, job: locked_job }
        next
      end

      due = ledger.amount_due_cents.to_i
      if due <= 0 && ledger.fully_funded && ledger.net_funded_cents.positive?
        locked_job.update!(funding_status: :funded) unless locked_job.funding_funded?
        early = { success: true, job: locked_job, already_funded: true }
        next
      end
      if due <= 0
        early = { success: false, error: "No outstanding funding amount to collect.", job: locked_job }
        next
      end

      confirmed = confirmed_amount_cents.to_i
      unless confirmed == due
        early = {
          success: false,
          error: "Confirmed amount must equal the outstanding requirement (#{due} cents).",
          amount_due_cents: due,
          job: locked_job
        }
        next
      end

      default_pm = JobFundingService.default_payment_method_id_for_job(locked_job)
      if default_pm.blank?
        early = { success: false, error: "Add a payment method before funding this job.", job: locked_job }
        next
      end
      if confirmed_payment_method_id.to_s != default_pm.to_s
        early = {
          success: false,
          error: "Confirmed payment method must match the company default payment method.",
          payment_method_id: default_pm,
          job: locked_job
        }
        next
      end

      # Any in-flight post_publish_top_up blocks a new debit (revision/amount-agnostic).
      inflight = locked_job.job_payment_transactions
        .where(transaction_type: :post_publish_top_up)
        .merge(JobPaymentTransaction.in_flight)
        .order(:id)
        .last
      if inflight
        if inflight.status_requires_action?
          early = {
            success: false,
            requires_action: true,
            client_secret: inflight.metadata_json.to_h["client_secret"],
            job: locked_job,
            transaction: inflight,
            amount_due_cents: due,
            error: "Additional authentication is required to complete this payment."
          }
        else
          locked_job.update!(funding_status: :adjustment_required) unless locked_job.funding_adjustment_required?
          early = {
            success: false,
            processing: true,
            job: locked_job,
            transaction: inflight,
            amount_due_cents: due,
            error: "ACH payment is processing. This job is not funded until the bank debit succeeds."
          }
        end
        next
      end
    end
    return early if early

    # collect! has its own job lock + typed idempotency key using the shortfall
    # recomputed under the lock above (due / locked_job.financial_revision).
    result = JobFundingService.collect!(
      job: locked_job,
      amount_cents: due,
      transaction_type: :post_publish_top_up,
      revision: locked_job.financial_revision
    )

    if result[:success]
      locked_job.update!(funding_status: :funded)
      JobFundingService.record_revision!(locked_job, source: source, transaction: result[:transaction])
      { success: true, job: locked_job, transaction: result[:transaction] }
    elsif result[:requires_action]
      locked_job.update!(funding_status: :adjustment_required)
      {
        success: false,
        requires_action: true,
        client_secret: result[:client_secret],
        job: locked_job,
        transaction: result[:transaction],
        amount_due_cents: due,
        error: "Additional authentication is required to complete this payment."
      }
    elsif result[:processing]
      locked_job.update!(funding_status: :adjustment_required)
      {
        success: false,
        processing: true,
        job: locked_job,
        transaction: result[:transaction],
        amount_due_cents: due,
        error: "ACH payment is processing. This job is not funded until the bank debit succeeds."
      }
    else
      locked_job.update!(funding_status: :adjustment_required) if locked_job.funding_unfunded? || locked_job.funding_failed?
      { success: false, error: result[:error] || "Could not collect funding.", job: locked_job, code: result[:code] }
    end
  end

  def self.refund_unfilled_job!(job)
    begin
      ledger = JobLedger.for(job)
    rescue JobLedger::MissingCommissionSnapshotError => e
      return { success: false, error: e.message, job: job }
    end
    return { success: true, job: job } if ledger.net_funded_cents <= 0

    result = JobFundingService.refund_delta!(
      job: job,
      amount_cents: ledger.net_funded_cents,
      transaction_type: :refund,
      revision: job.financial_revision.to_i + 1
    )
    if result[:success]
      job.update!(funding_status: :unfunded, financial_revision: job.financial_revision.to_i + 1)
    end
    result.merge(job: job)
  end
end
