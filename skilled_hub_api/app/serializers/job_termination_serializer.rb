# frozen_string_literal: true

class JobTerminationSerializer < ActiveModel::Serializer
  attributes :id, :job_id, :job_application_id, :technician_profile_id,
             :initiated_by_user_id, :initiated_by_role, :reason, :reason_label, :notes,
             :terminated_at, :effective_end_at, :last_worked_on_date,
             :original_scheduled_start_at, :original_scheduled_end_at, :original_estimated_hours,
             :original_agreed_labor_cents, :original_net_funded_cents, :original_company_required_cents,
             :pay_basis, :approved_hours, :approved_gross_labor_cents, :rejected_hours,
             :canceled_scheduled_hours, :work_performed, :zero_hour_termination,
             :refund_cents, :technician_payout_cents, :settlement_status, :settlement_error,
             :settlement_result, :guaranteed_job_pay, :created_at

  def pay_basis
    object.pay_basis_key
  end

  def guaranteed_job_pay
    object.pay_basis_guaranteed_job_pay?
  end

  def original_estimated_hours
    object.original_estimated_hours&.to_f
  end

  def approved_hours
    object.approved_hours.to_f
  end

  def rejected_hours
    object.rejected_hours.to_f
  end

  def canceled_scheduled_hours
    object.canceled_scheduled_hours&.to_f
  end
end
