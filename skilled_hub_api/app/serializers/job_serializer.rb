class JobSerializer < ActiveModel::Serializer
  attributes :id, :title, :description, :required_documents, :required_certifications, :location, :status, :company_profile_id, :created_at, :updated_at, :timeline,
             :share_token,
             :scheduled_start_at, :scheduled_end_at, :finished_at, :price_cents, :hourly_rate_cents, :hours_per_day, :days,
             :job_amount_cents, :company_charge_cents, :tech_payout_cents,
             :address, :city, :state, :zip_code, :country, :latitude, :longitude,
             :skill_class, :minimum_years_experience, :notes, :go_live_at, :start_mode,
             :require_background_check, :require_identity_verification, :minimum_verified_references, :require_insurance_verification,
             :rolling_start_rule_type, :rolling_start_exact_start_at, :rolling_start_days_after_acceptance,
             :rolling_start_weekday, :rolling_start_weekday_time,
             :weekend_work_policy, :standard_work_days, :saturday_work_policy, :sunday_work_policy,
             :saturday_multiplier, :sunday_multiplier, :weekend_requires_company_approval, :weekend_requires_technician_acceptance,
             :premium_combination_rule, :overtime_enabled, :daily_overtime_threshold_hours, :weekly_overtime_threshold_hours,
             :overtime_multiplier, :hard_deadline_at, :job_timezone, :standard_day_shifts, :weekend_day_shifts,
             :schedule_and_pay_summary,
             :timeline_events, :pending_counter_offer

  belongs_to :company_profile
  has_many :job_applications

  attribute :payment_summary, if: :participant_on_job?
  attribute :certification_match, if: :cert_match_requested?

  def timeline_events
    ev = []
    ev << { key: 'posted', label: 'Posted', at: object.created_at&.iso8601 }
    app = object.job_applications.find_by(status: :accepted)
    ev << { key: 'claimed', label: 'Claimed', at: app&.created_at&.iso8601 } if app

    pay = object.payments.min_by(&:created_at)
    if pay&.held_at
      ev << { key: 'payment_secured', label: 'Payment secured (escrow)', at: pay.held_at.iso8601 }
    end

    if object.finished_at
      ev << { key: 'completed', label: 'Marked complete', at: object.finished_at.iso8601 }
    end

    released = object.payments.find { |p| p.status == 'released' }
    if released&.released_at
      ev << { key: 'payout', label: 'Payout released to technician', at: released.released_at.iso8601 }
    end

    ev.compact
  end

  def payment_summary
    held = object.payments.find { |p| p.status == 'held' }
    released = object.payments.find { |p| p.status == 'released' }
    {
      state: if released
               'released'
             elsif held
               'held'
             else
               'none'
             end,
      held_at: held&.held_at&.iso8601,
      released_at: released&.released_at&.iso8601,
      tech_payout_cents: object.tech_payout_cents,
      company_charge_cents: object.company_charge_cents
    }
  end

  def certification_match
    CertificateMatchingService.score_for_job_and_technician(object, scope.technician_profile)
  end

  def cert_match_requested?
    instance_options[:include_certification_match] && scope&.technician? && scope.technician_profile.present?
  end

  def participant_on_job?
    u = scope
    return false unless u
    return true if u.admin?
    return true if u.company? && object.company_profile.user_id == u.id

    if u.technician?
      app = object.job_applications.find_by(status: :accepted)
      app&.technician_profile&.user_id == u.id
    else
      false
    end
  end

  def pending_counter_offer
    offer = object.job_counter_offers.where(status: [:pending_company, :pending_technician]).order(created_at: :desc).first
    return nil unless offer

    JobCounterOfferSerializer.new(offer, scope: scope).as_json
  end

  def schedule_and_pay_summary
    standard_days = weekday_labels(object.standard_work_days)
    weekend_line =
      case object.weekend_work_policy
      when "prohibited"
        "No work will take place Saturday or Sunday. If unfinished on Friday, work resumes on the next scheduled workday."
      when "optional"
        "Weekend work may be offered if needed and requires acceptance before weekend hours can be submitted."
      else
        "Weekend work is required based on configured Saturday/Sunday availability."
      end

    overtime_line =
      if object.overtime_enabled?
        "Overtime is enabled at #{object.overtime_multiplier || 1.5}x. When overtime and weekend premium overlap, TechFlash applies the #{object.premium_combination_rule.humanize.downcase} rule."
      else
        "Overtime is not enabled for this job."
      end

    "Work is expected on #{standard_days}. #{weekend_line} #{overtime_line}"
  end

  def address
    return object.address if participant_on_job?
    return object.address if scope&.admin?

    nil
  end

  def zip_code
    return object.zip_code if participant_on_job?
    return object.zip_code if scope&.admin?

    nil
  end

  def latitude
    return object.latitude if participant_on_job? || scope&.admin?

    blurred_coordinates[0]
  end

  def longitude
    return object.longitude if participant_on_job? || scope&.admin?

    blurred_coordinates[1]
  end

  def blurred_coordinates
    @blurred_coordinates ||= MapPrivacyService.blurred_coordinates(
      latitude: object.latitude,
      longitude: object.longitude,
      seed_key: "#{object.share_token}:#{object.id}"
    )
  end

  def weekday_labels(days)
    labels = {
      1 => "Monday",
      2 => "Tuesday",
      3 => "Wednesday",
      4 => "Thursday",
      5 => "Friday",
      6 => "Saturday",
      7 => "Sunday"
    }
    Array(days).map { |d| labels[d.to_i] }.compact.join(", ")
  end
end
