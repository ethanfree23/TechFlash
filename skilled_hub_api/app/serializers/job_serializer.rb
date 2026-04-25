class JobSerializer < ActiveModel::Serializer
  attributes :id, :title, :description, :required_documents, :required_certifications, :location, :status, :company_profile_id, :created_at, :updated_at, :timeline,
             :scheduled_start_at, :scheduled_end_at, :finished_at, :price_cents, :hourly_rate_cents, :hours_per_day, :days,
             :job_amount_cents, :company_charge_cents, :tech_payout_cents,
             :address, :city, :state, :zip_code, :country, :latitude, :longitude,
             :skill_class, :minimum_years_experience, :notes, :go_live_at,
             :timeline_events

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
end
