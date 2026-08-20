# frozen_string_literal: true

class JobSettlementService
  RELEASE_HOURS = 72

  def self.settle_and_release_if_eligible!(job)
    return { skipped: true, reason: "Job is not finished" } unless job.finished? && job.finished_at.present?

    settle_result = settle!(job)
    return settle_result unless settle_result[:success]
    return { success: true, settled: true, released: false, reason: "Release conditions not met" } unless release_eligible?(job)

    PaymentService.release_to_technician(job.payments.order(:id).first)
  end

  def self.settle!(job)
    labor = settlement_labor_cents(job)
    due_cents = 0
    refundable_cents = 0
    revision = nil

    Job.transaction do
      locked = Job.lock.find(job.id)
      if locked.actual_hours_worked? && labor.nil?
        locked.update!(settlement_status: :settlement_blocked)
        return { success: false, error: "Approved time entries are required before settling an Actual Hours Worked job." }
      end

      locked.update!(agreed_labor_cents: labor) if locked.actual_hours_worked? && labor.present?

      begin
        ledger = JobLedger.for(locked)
      rescue JobLedger::MissingCommissionSnapshotError => e
        locked.update!(settlement_status: :settlement_blocked)
        return { success: false, error: e.message }
      end

      due_cents = ledger.amount_due_cents
      refundable_cents = ledger.amount_refundable_cents
      revision = locked.financial_revision.to_i
    end

    job.reload

    if due_cents.positive?
      result = JobFundingService.collect!(
        job: job,
        amount_cents: due_cents,
        transaction_type: :final_hours_top_up,
        revision: revision + 1
      )
      job.increment!(:financial_revision)
      if result[:requires_action]
        job.update!(funding_status: :adjustment_required, settlement_status: :settlement_blocked)
        return { success: false, requires_action: true, client_secret: result[:client_secret], error: "Additional company payment is required before technician payout." }
      end
      unless result[:success]
        job.update!(funding_status: :adjustment_required, settlement_status: :settlement_blocked)
        return { success: false, error: result[:error] || "Could not collect the remaining job amount." }
      end
    elsif refundable_cents.positive?
      result = JobFundingService.refund_delta!(
        job: job,
        amount_cents: refundable_cents,
        transaction_type: :final_hours_refund,
        revision: revision + 1
      )
      job.increment!(:financial_revision)
      unless result[:success]
        job.update!(settlement_status: :settlement_blocked)
        return { success: false, error: result[:error] || "Could not refund unused job funding." }
      end
    end

    begin
      ledger = JobLedger.for(job.reload)
    rescue JobLedger::MissingCommissionSnapshotError => e
      job.update!(settlement_status: :settlement_blocked)
      return { success: false, error: e.message }
    end
    unless ledger.fully_funded
      job.update!(settlement_status: :settlement_blocked, funding_status: :adjustment_required)
      return { success: false, error: "Job is underfunded and cannot be settled." }
    end

    job.update!(settlement_status: :settled, funding_status: :funded)
    JobFundingService.record_revision!(job, source: "settlement")
    { success: true, settled: true, job: job }
  end

  def self.settlement_labor_cents(job)
    if job.guaranteed_job_pay?
      job.agreed_labor_cents.to_i
    else
      approved = JobLedger.new(job).approved_gross_pay_cents
      return nil if approved <= 0

      approved
    end
  end

  def self.release_eligible?(job)
    return false unless job.finished? && job.finished_at.present?
    return true if job.finished_at <= RELEASE_HOURS.hours.ago

    company_profile = job.company_profile
    accepted_app = job.job_applications.find_by(status: :accepted)
    technician_profile = accepted_app&.technician_profile
    return false unless technician_profile

    company_reviewed = Rating.exists?(job: job, reviewer: company_profile)
    tech_reviewed = Rating.exists?(job: job, reviewer: technician_profile)
    company_reviewed && tech_reviewed
  end
end
