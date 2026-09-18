# frozen_string_literal: true

module Jobs
  # Read-only projection of what ending an assignment early would do.
  class TerminationSummary
    BLOCKER_MESSAGES = {
      not_claimed: "Only a claimed assignment that is still in progress can be ended early.",
      already_terminated: "This assignment has already been ended early.",
      already_finished: "This job has already reached a terminal state.",
      no_accepted_application: "This job has no claimed technician to release.",
      unresolved_submitted_time_entries: "Resolve outstanding time entries before ending this assignment.",
      missing_commission_snapshot: "This job is missing a commission snapshot, so it cannot be settled safely. Contact support.",
      payout_already_released: "The technician payout for this job has already been released and cannot be reversed."
    }.freeze

    def self.call(job:, effective_end_at: nil)
      new(job: job, effective_end_at: effective_end_at)
    end

    def initialize(job:, effective_end_at: nil)
      @job = job
      @requested_effective_end_at = effective_end_at.presence
    end

    attr_reader :job

    def job_application
      @job_application ||= job.job_applications.find_by(status: :accepted)
    end

    def technician_profile
      job_application&.technician_profile
    end

    def original_scheduled_start_at
      job.scheduled_start_at
    end

    def original_scheduled_end_at
      job.scheduled_end_at
    end

    def original_estimated_hours
      job.estimated_hours.presence || JobMoney.estimated_hours(job.hours_per_day, job.days)
    end

    def original_agreed_labor_cents
      value = job.agreed_labor_cents.to_i
      value.positive? ? value : job.job_amount_cents.to_i
    end

    def original_net_funded_cents
      ledger&.net_funded_cents.to_i
    end

    def original_company_required_cents
      ledger&.company_required_cents.to_i
    end

    def guaranteed_job_pay?
      job.guaranteed_job_pay?
    end

    def approved_entries
      @approved_entries ||= job.time_entries.where(status: :approved).to_a
    end

    def submitted_entries
      @submitted_entries ||= job.time_entries.where(status: :submitted).to_a
    end

    def rejected_entries
      @rejected_entries ||= job.time_entries.where(status: :rejected).to_a
    end

    def approved_hours
      @approved_hours ||= approved_entries.sum { |e| e.worked_hours.to_d }
    end

    def submitted_hours
      @submitted_hours ||= submitted_entries.sum { |e| e.worked_hours.to_d }
    end

    def rejected_hours
      @rejected_hours ||= rejected_entries.sum { |e| e.worked_hours.to_d }
    end

    def submitted_count
      submitted_entries.size
    end

    def approved_gross_labor_cents
      @approved_gross_labor_cents ||= JobLedger.new(job).approved_gross_pay_cents
    end

    def work_performed?
      approved_hours.positive?
    end

    def zero_hour_termination?
      !guaranteed_job_pay? && approved_gross_labor_cents <= 0
    end

    def earliest_allowed_effective_end_at
      approved_entries.map(&:worked_end_at).compact.max
    end

    def default_effective_end_at
      earliest_allowed_effective_end_at || Time.current
    end

    def effective_end_at
      @effective_end_at ||= parsed_requested_effective_end_at || default_effective_end_at
    end

    def effective_end_at_error
      if @requested_effective_end_at.present? && parsed_requested_effective_end_at.nil?
        return "Enter a valid date and time for when the work ended."
      end
      if effective_end_at > Time.current + 5.minutes
        return "The effective end cannot be in the future."
      end
      earliest = earliest_allowed_effective_end_at
      if earliest.present? && effective_end_at < earliest
        return "The effective end cannot be earlier than the last approved time entry " \
               "(#{earliest.in_time_zone(job_timezone).strftime('%b %-d, %Y %-l:%M %p')}). " \
               "Ending an assignment does not change approved hours."
      end

      nil
    end

    def last_worked_on_date
      approved_entries.map(&:worked_on_date).compact.max
    end

    def canceled_scheduled_hours
      return @canceled_scheduled_hours if defined?(@canceled_scheduled_hours)

      @canceled_scheduled_hours = canceled_hours_from_schedule || canceled_hours_from_estimate
    end

    def canceled_scheduled_hours_basis
      canceled_scheduled_hours
      @canceled_scheduled_hours_basis
    end

    def canceled_scheduled_days
      canceled_scheduled_hours
      @canceled_scheduled_days
    end

    def projected_labor_cents
      guaranteed_job_pay? ? original_agreed_labor_cents : approved_gross_labor_cents
    end

    def projected_company_required_cents
      return nil if company_commission_percent.nil?

      JobMoney.company_charge_cents(projected_labor_cents, company_commission_percent)
    end

    def projected_refund_cents
      required = projected_company_required_cents
      return nil if required.nil?

      [original_net_funded_cents - required, 0].max
    end

    def projected_additional_charge_cents
      required = projected_company_required_cents
      return nil if required.nil?

      [required - original_net_funded_cents, 0].max
    end

    def projected_technician_payout_cents
      return nil if technician_commission_percent.nil?

      JobMoney.technician_payout_cents(projected_labor_cents, technician_commission_percent)
    end

    def company_commission_percent
      ledger&.company_commission_percent
    end

    def technician_commission_percent
      ledger&.technician_commission_percent
    end

    def blockers
      @blockers ||= begin
        codes = []
        codes << :already_terminated if job.terminated_early?
        codes << :already_finished if !job.terminated_early? && (job.finished? || job.completed?)
        codes << :not_claimed unless job.reserved? || job.filled?
        codes << :no_accepted_application if job_application.blank?
        codes << :unresolved_submitted_time_entries if submitted_count.positive?
        codes << :missing_commission_snapshot if ledger.nil?
        codes << :payout_already_released if ledger&.transferred_cents.to_i.positive?
        codes.uniq.map { |code| { code: code.to_s, message: BLOCKER_MESSAGES[code] } }
      end
    end

    def terminable?
      blockers.empty? && effective_end_at_error.nil?
    end

    def job_timezone
      job.job_timezone.presence || "UTC"
    end

    def as_json(*)
      {
        job_id: job.id,
        job_title: job.title,
        pay_basis: job.pay_basis,
        guaranteed_job_pay: guaranteed_job_pay?,
        technician: technician_payload,
        job_timezone: job_timezone,
        original: {
          scheduled_start_at: original_scheduled_start_at&.iso8601,
          scheduled_end_at: original_scheduled_end_at&.iso8601,
          estimated_hours: original_estimated_hours&.to_f,
          agreed_labor_cents: original_agreed_labor_cents,
          net_funded_cents: original_net_funded_cents,
          company_required_cents: original_company_required_cents,
          hours_per_day: job.hours_per_day,
          days: job.days
        },
        effective_end_at: effective_end_at&.iso8601,
        default_effective_end_at: default_effective_end_at&.iso8601,
        earliest_allowed_effective_end_at: earliest_allowed_effective_end_at&.iso8601,
        effective_end_at_error: effective_end_at_error,
        last_worked_on_date: last_worked_on_date,
        time_entries: {
          approved_hours: approved_hours.to_f,
          approved_gross_labor_cents: approved_gross_labor_cents,
          submitted_hours: submitted_hours.to_f,
          submitted_count: submitted_count,
          rejected_hours: rejected_hours.to_f,
          rejected_count: rejected_entries.size,
          approved: serialize_entries(approved_entries),
          submitted: serialize_entries(submitted_entries),
          rejected: serialize_entries(rejected_entries)
        },
        canceled_scheduled_hours: canceled_scheduled_hours&.to_f,
        canceled_scheduled_days: canceled_scheduled_days,
        canceled_scheduled_hours_basis: canceled_scheduled_hours_basis,
        projected: {
          labor_cents: projected_labor_cents,
          company_required_cents: projected_company_required_cents,
          technician_payout_cents: projected_technician_payout_cents,
          refund_cents: projected_refund_cents,
          additional_charge_cents: projected_additional_charge_cents,
          company_commission_percent: company_commission_percent&.to_f,
          technician_commission_percent: technician_commission_percent&.to_f
        },
        zero_hour_termination: zero_hour_termination?,
        work_performed: work_performed?,
        terminable: terminable?,
        blockers: blockers,
        reasons: JobTermination::REASON_LABELS.map { |value, label| { value: value, label: label } }
      }
    end

    private

    def serialize_entries(entries)
      entries.sort_by { |e| e.worked_start_at || Time.at(0) }.reverse.map do |entry|
        {
          id: entry.id,
          status: entry.status,
          worked_on_date: entry.worked_on_date,
          worked_start_at: entry.worked_start_at&.iso8601,
          worked_end_at: entry.worked_end_at&.iso8601,
          worked_hours: entry.worked_hours.to_f,
          gross_pay_cents: entry.time_entry_pay_line&.gross_pay_cents
        }
      end
    end

    def technician_payload
      return nil if technician_profile.blank?

      user = technician_profile.user
      {
        technician_profile_id: technician_profile.id,
        name: [user&.first_name, user&.last_name].compact.join(" ").presence || user&.email,
        email: user&.email
      }
    end

    def ledger
      return @ledger if defined?(@ledger)

      @ledger = begin
        JobLedger.for(job)
      rescue JobLedger::MissingCommissionSnapshotError
        nil
      end
    end

    def parsed_requested_effective_end_at
      return @parsed_requested_effective_end_at if defined?(@parsed_requested_effective_end_at)

      @parsed_requested_effective_end_at =
        if @requested_effective_end_at.is_a?(Time) || @requested_effective_end_at.is_a?(DateTime)
          @requested_effective_end_at.in_time_zone
        elsif @requested_effective_end_at.present?
          begin
            Time.zone.parse(@requested_effective_end_at.to_s)
          rescue ArgumentError
            nil
          end
        end
    end

    def canceled_hours_from_schedule
      return nil if original_scheduled_end_at.blank? || job.hours_per_day.to_i <= 0

      tz = job_timezone
      first_canceled_date = effective_end_at.in_time_zone(tz).to_date + 1
      last_scheduled_date = original_scheduled_end_at.in_time_zone(tz).to_date
      return set_canceled(0, 0, "schedule") if first_canceled_date > last_scheduled_date

      work_days = Array(job.standard_work_days).map(&:to_i).uniq
      work_days = [1, 2, 3, 4, 5] if work_days.empty?

      days = (first_canceled_date..last_scheduled_date).count { |date| work_days.include?(date.cwday) }
      set_canceled(BigDecimal(days.to_s) * BigDecimal(job.hours_per_day.to_s), days, "schedule")
    end

    def canceled_hours_from_estimate
      estimate = original_estimated_hours
      return set_canceled(nil, nil, nil) if estimate.blank?

      set_canceled([estimate.to_d - approved_hours, 0].max, nil, "estimate")
    end

    def set_canceled(hours, days, basis)
      @canceled_scheduled_days = days
      @canceled_scheduled_hours_basis = basis
      hours
    end
  end
end
