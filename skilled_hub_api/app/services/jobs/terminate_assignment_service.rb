# frozen_string_literal: true

module Jobs
  # Company-initiated early end of a claimed assignment.
  #
  # Cancellation ends FUTURE work. It never retroactively erases legitimate work already
  # performed. All database work commits before any Stripe call.
  class TerminateAssignmentService
    Result = Struct.new(:success, :termination, :job, :error, :status, :blockers, :idempotent, keyword_init: true) do
      def success?
        !!success
      end
    end

    def self.call(job:, actor_user:, reason:, notes: nil, effective_end_at: nil)
      new(job: job, actor_user: actor_user, reason: reason, notes: notes, effective_end_at: effective_end_at).call
    end

    def initialize(job:, actor_user:, reason:, notes: nil, effective_end_at: nil)
      @job = job
      @actor_user = actor_user
      @reason = reason.to_s.presence
      @notes = notes.to_s.strip.presence
      @requested_effective_end_at = effective_end_at
    end

    def call
      authorization_error = authorize
      return authorization_error if authorization_error

      reason_error = validate_reason
      return reason_error if reason_error

      existing = JobTermination.find_by(job_id: @job.id)
      return Result.new(success: true, termination: existing, job: @job.reload, idempotent: true) if existing

      termination = nil
      early = nil

      Job.transaction do
        locked = Job.lock.find(@job.id)

        if (existing_inside = JobTermination.find_by(job_id: locked.id))
          early = Result.new(success: true, termination: existing_inside, job: locked, idempotent: true)
          raise ActiveRecord::Rollback
        end

        summary = TerminationSummary.call(job: locked, effective_end_at: @requested_effective_end_at)

        if summary.blockers.any?
          early = Result.new(
            success: false,
            error: summary.blockers.first[:message],
            status: :unprocessable_entity,
            blockers: summary.blockers,
            job: locked
          )
          raise ActiveRecord::Rollback
        end

        if (end_error = summary.effective_end_at_error)
          early = Result.new(success: false, error: end_error, status: :unprocessable_entity, job: locked)
          raise ActiveRecord::Rollback
        end

        termination = build_termination!(locked, summary)
        write_audit!(locked, summary, termination)
        truncate_schedule!(locked, summary)
        cancel_future_weekend_requests!(locked, summary)
        mark_terminal!(locked, summary, termination)
      end

      return early if early

      @job.reload
      settle_and_record!(termination)
      notify!(termination)

      Result.new(success: true, termination: termination.reload, job: @job.reload)
    end

    private

    def authorize
      if @actor_user.blank?
        return Result.new(success: false, error: "Authentication required", status: :unauthorized)
      end
      return nil if @actor_user.admin?
      unless @actor_user.company? && @job.company_profile_id == @actor_user.company_profile&.id
        return Result.new(success: false, error: "Access denied", status: :forbidden)
      end

      nil
    end

    def validate_reason
      unless JobTermination.reasons.key?(@reason)
        return Result.new(
          success: false,
          error: "Select a reason for ending this assignment.",
          status: :unprocessable_entity
        )
      end
      if @reason == "other" && @notes.blank?
        return Result.new(
          success: false,
          error: "Add a note describing why you are ending this assignment.",
          status: :unprocessable_entity
        )
      end

      nil
    end

    def actor_role
      @actor_user.admin? ? :admin : :company
    end

    def build_termination!(locked, summary)
      JobTermination.create!(
        job: locked,
        job_application: summary.job_application,
        technician_profile: summary.technician_profile,
        initiated_by_user: @actor_user,
        initiated_by_role: actor_role,
        reason: @reason,
        notes: @notes,
        terminated_at: Time.current,
        effective_end_at: summary.effective_end_at,
        last_worked_on_date: summary.last_worked_on_date,
        original_scheduled_start_at: summary.original_scheduled_start_at,
        original_scheduled_end_at: summary.original_scheduled_end_at,
        original_estimated_hours: summary.original_estimated_hours,
        original_agreed_labor_cents: summary.original_agreed_labor_cents,
        original_net_funded_cents: summary.original_net_funded_cents,
        original_company_required_cents: summary.original_company_required_cents,
        pay_basis: Job.pay_bases[locked.pay_basis],
        approved_hours: summary.approved_hours,
        approved_gross_labor_cents: summary.approved_gross_labor_cents,
        rejected_hours: summary.rejected_hours,
        canceled_scheduled_hours: summary.canceled_scheduled_hours,
        work_performed: summary.work_performed?,
        zero_hour_termination: summary.zero_hour_termination?
      )
    end

    def write_audit!(locked, summary, termination)
      JobTermChangeAudit.create!(
        job: locked,
        actor_user: @actor_user,
        change_type: "assignment_terminated_early",
        reason: [termination.reason_label, @notes].compact.join(" — "),
        previous_values: {
          "status" => locked.status,
          "scheduled_start_at" => summary.original_scheduled_start_at,
          "scheduled_end_at" => summary.original_scheduled_end_at,
          "estimated_hours" => summary.original_estimated_hours&.to_s,
          "agreed_labor_cents" => summary.original_agreed_labor_cents,
          "net_funded_cents" => summary.original_net_funded_cents
        },
        new_values: {
          "status" => "finished",
          "terminated_at" => termination.terminated_at,
          "effective_end_at" => summary.effective_end_at,
          "scheduled_end_at" => truncated_scheduled_end_at(locked, summary),
          "termination_reason" => termination.reason,
          "approved_hours" => summary.approved_hours.to_s,
          "approved_gross_labor_cents" => summary.approved_gross_labor_cents,
          "canceled_scheduled_hours" => summary.canceled_scheduled_hours&.to_s,
          "pay_basis" => locked.pay_basis,
          "projected_refund_cents" => summary.projected_refund_cents,
          "projected_technician_payout_cents" => summary.projected_technician_payout_cents
        },
        requires_technician_acknowledgement: false
      )
    end

    def truncated_scheduled_end_at(locked, summary)
      current_end = locked.scheduled_end_at
      return summary.effective_end_at if current_end.blank?

      [current_end, summary.effective_end_at].min
    end

    def truncate_schedule!(locked, summary)
      new_end = truncated_scheduled_end_at(locked, summary)
      return if new_end.blank?
      return if locked.scheduled_end_at.present? && locked.scheduled_end_at <= new_end

      locked.update_columns(scheduled_end_at: new_end, updated_at: Time.current)
    end

    def cancel_future_weekend_requests!(locked, summary)
      locked.weekend_work_requests
        .where(status: [
          WeekendWorkRequest.statuses[:not_requested],
          WeekendWorkRequest.statuses[:requested_by_company],
          WeekendWorkRequest.statuses[:accepted_by_technician]
        ])
        .where("requested_start_at > ?", summary.effective_end_at)
        .find_each do |request|
          request.update_columns(
            status: WeekendWorkRequest.statuses[:cancelled],
            cancelled_at: Time.current,
            updated_at: Time.current
          )
        end
    end

    def mark_terminal!(locked, _summary, termination)
      locked.update!(
        status: :finished,
        finished_at: termination.terminated_at,
        terminated_at: termination.terminated_at
      )
    end

    def settle_and_record!(termination)
      job = @job.reload
      result =
        begin
          JobSettlementService.settle_and_release_if_eligible!(
            job,
            refund_transaction_type: :cancellation_refund,
            allow_zero_labor: true
          )
        rescue StandardError => e
          Rails.logger.error("[terminate_assignment] settlement failed job_id=#{job.id}: #{e.class} #{e.message}")
          { success: false, error: "Settlement could not be completed: #{e.message}" }
        end

      job.reload
      ledger = safe_ledger(job)

      termination.update!(
        refund_cents: refund_cents_for(job),
        technician_payout_cents: ledger&.technician_net_payout_cents,
        settlement_status: job.settlement_status,
        settlement_error: result[:error].presence,
        settlement_result: {
          "success" => !!result[:success],
          "settled" => !!result[:settled],
          "released" => !!result[:released],
          "reason" => result[:reason],
          "error" => result[:error],
          "labor_cents" => ledger&.labor_cents,
          "company_required_cents" => ledger&.company_required_cents,
          "net_funded_cents" => ledger&.net_funded_cents,
          "additional_charge_cents" => ledger&.amount_due_cents,
          "transferred_cents" => ledger&.transferred_cents,
          "settled_at" => Time.current.iso8601
        }
      )

      close_out_fully_refunded_payment!(job, ledger)
      result
    end

    def refund_cents_for(job)
      job.job_payment_transactions
        .status_succeeded
        .where(transaction_type: :cancellation_refund)
        .sum(:amount_cents)
        .to_i
    end

    def close_out_fully_refunded_payment!(job, ledger)
      return if ledger.nil?
      return unless ledger.net_funded_cents <= 0 && ledger.transferred_cents.zero?

      job.payments.where(status: %w[pending held]).find_each do |payment|
        payment.update!(status: "refunded")
      end
    end

    def safe_ledger(job)
      JobLedger.for(job)
    rescue JobLedger::MissingCommissionSnapshotError
      nil
    end

    def notify!(termination)
      job = @job.reload
      technician_user = termination.technician_profile&.user
      company_user = job.company_profile&.user

      MailDelivery.safe_deliver do
        UserMailer.assignment_ended_for_technician(job, termination).deliver_now
        UserMailer.assignment_ended_for_company(job, termination).deliver_now
      end

      create_app_notification!(
        user: technician_user,
        title: "Assignment ended: #{job.title}",
        body: technician_notification_body(job, termination),
        termination: termination
      )
      create_app_notification!(
        user: company_user,
        title: "You ended the assignment for #{job.title}",
        body: company_notification_body(termination),
        termination: termination
      )
    rescue StandardError => e
      Rails.logger.error("[terminate_assignment] notification failed job_id=#{@job.id}: #{e.class} #{e.message}")
    end

    def create_app_notification!(user:, title:, body:, termination:)
      return if user.blank?

      AppNotification.create!(
        user: user,
        category: "job_lifecycle",
        title: title,
        body: body,
        metadata: {
          "job_id" => termination.job_id,
          "job_termination_id" => termination.id,
          "event" => "assignment_terminated_early",
          "effective_end_at" => termination.effective_end_at&.iso8601
        }
      )
    end

    def technician_notification_body(job, termination)
      parts = ["Your assignment with #{job.company_profile&.company_name || 'the company'} ended effective #{format_time(termination)}."]
      parts << "Remaining scheduled work has been canceled."
      if termination.pay_basis_guaranteed_job_pay?
        parts << "This job is Guaranteed Job Pay, so the agreed job pay still applies."
      elsif termination.approved_hours.to_d.positive?
        parts << "#{format_hours(termination.approved_hours)} of approved hours remain payable under the normal payment schedule."
      else
        parts << "No approved hours were recorded for this assignment."
      end
      parts.join(" ")
    end

    def company_notification_body(termination)
      parts = ["Effective end: #{format_time(termination)}. Reason: #{termination.reason_label}."]
      if termination.refund_cents.to_i.positive?
        parts << "A refund of #{format_cents(termination.refund_cents)} is being processed."
      end
      parts << "You can now review the technician for the work performed."
      parts.join(" ")
    end

    def format_time(termination)
      tz = @job.job_timezone.presence || "UTC"
      termination.effective_end_at.in_time_zone(tz).strftime("%b %-d, %Y %-l:%M %p")
    end

    def format_hours(hours)
      value = hours.to_d
      value == value.to_i ? "#{value.to_i} hours" : format("%.2f hours", value)
    end

    def format_cents(cents)
      format("$%.2f", cents.to_i / 100.0)
    end
  end
end
