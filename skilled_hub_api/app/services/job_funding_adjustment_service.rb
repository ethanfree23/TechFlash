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
    ledger = JobLedger.for(job)
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

  def self.refund_unfilled_job!(job)
    ledger = JobLedger.for(job)
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
