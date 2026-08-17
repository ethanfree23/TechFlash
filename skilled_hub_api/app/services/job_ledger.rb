# frozen_string_literal: true

class JobLedger
  Summary = Struct.new(
    :labor_cents,
    :company_required_cents,
    :collected_cents,
    :refunded_cents,
    :net_funded_cents,
    :technician_gross_cents,
    :company_commission_cents,
    :technician_commission_cents,
    :technician_net_payout_cents,
    :amount_due_cents,
    :amount_refundable_cents,
    :transferred_cents,
    :fully_funded,
    keyword_init: true
  )

  def self.for(job)
    new(job).summary
  end

  def initialize(job)
    @job = job
  end

  def summary
    labor = current_labor_cents
    company_pct = @job.company_commission_percent_snapshot || 0
    tech_pct = @job.technician_commission_percent_snapshot || 0
    required = JobMoney.company_charge_cents(labor, company_pct)
    collected = sum_types(%w[initial_job_charge counteroffer_top_up final_hours_top_up])
    refunded = sum_types(%w[counteroffer_refund final_hours_refund refund])
    net = collected - refunded
    transferred = sum_types(%w[technician_transfer]) - sum_types(%w[transfer_reversal])
    company_commission = JobMoney.percent_of(labor, company_pct)
    tech_commission = JobMoney.percent_of(labor, tech_pct)
    tech_net = JobMoney.technician_payout_cents(labor, tech_pct)
    due = [required - net, 0].max
    refundable = [net - required, 0].max

    Summary.new(
      labor_cents: labor,
      company_required_cents: required,
      collected_cents: collected,
      refunded_cents: refunded,
      net_funded_cents: net,
      technician_gross_cents: labor,
      company_commission_cents: company_commission,
      technician_commission_cents: tech_commission,
      technician_net_payout_cents: tech_net,
      amount_due_cents: due,
      amount_refundable_cents: refundable,
      transferred_cents: transferred,
      fully_funded: due.zero?
    )
  end

  def current_labor_cents
    if @job.guaranteed_job_pay?
      @job.agreed_labor_cents.to_i
    else
      approved = approved_gross_pay_cents
      return approved if approved.positive? && @job.finished?

      @job.agreed_labor_cents.to_i.positive? ? @job.agreed_labor_cents.to_i : @job.job_amount_cents.to_i
    end
  end

  def approved_gross_pay_cents
    TimeEntryPayLine.joins(:time_entry)
      .where(job_id: @job.id, time_entries: { status: TimeEntry.statuses[:approved] })
      .sum(:gross_pay_cents)
      .to_i
  end

  private

  def sum_types(types)
    rel = @job.job_payment_transactions.status_succeeded.where(transaction_type: types)
    rel.sum(:amount_cents).to_i
  end
end
