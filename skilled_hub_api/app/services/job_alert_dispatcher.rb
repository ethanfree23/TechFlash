class JobAlertDispatcher
  DEDUPE_TTL = 1.hour

  def self.dispatch_for_job(job)
    TechnicianProfile.includes(:user).find_each do |tech|
      user = tech.user
      next unless user&.job_alert_notifications_enabled?

      dedupe_key = "job_alert_dedupe:v1:#{job.id}:#{user.id}"
      next if Rails.cache.exist?(dedupe_key)

      pref = user.job_alert_preference || default_preference_for(user)
      next unless matches_trade?(pref: pref, job: job)
      next unless matches_pay?(pref: pref, job: job)
      next unless matches_duration?(pref: pref, job: job)
      next unless matches_distance?(pref: pref, job: job, technician_profile: tech)

      delivered = false
      delivered ||= deliver_email(user: user, job: job) if pref.email_enabled?
      delivered ||= deliver_sms(user: user, job: job) if pref.sms_enabled?
      delivered ||= deliver_app(user: user, job: job) if pref.app_enabled?

      Rails.cache.write(dedupe_key, true, expires_in: DEDUPE_TTL) if delivered
    end
  end

  def self.default_preference_for(user)
    user.create_job_alert_preference!(
      trade_label: nil,
      min_hourly_rate_cents: 0,
      max_distance_miles: 200,
      min_duration_weeks: nil,
      max_duration_weeks: nil,
      email_enabled: true,
      sms_enabled: true,
      app_enabled: true
    )
  end

  def self.matches_trade?(pref:, job:)
    return true if pref.trade_label.blank?
    return true if job.skill_class.blank?

    pref.trade_label.to_s.downcase == job.skill_class.to_s.downcase
  end

  def self.matches_pay?(pref:, job:)
    job.hourly_rate_cents.to_i >= pref.min_hourly_rate_cents.to_i
  end

  def self.matches_duration?(pref:, job:)
    return true if job.days.blank?

    weeks = (job.days.to_f / 5.0).ceil
    return false if pref.min_duration_weeks.present? && weeks < pref.min_duration_weeks
    return false if pref.max_duration_weeks.present? && weeks > pref.max_duration_weeks

    true
  end

  def self.matches_distance?(pref:, job:, technician_profile:)
    return true if technician_profile.latitude.blank? || technician_profile.longitude.blank?
    return true if job.latitude.blank? || job.longitude.blank?

    miles = GeocodingService.distance_miles(
      technician_profile.latitude.to_f,
      technician_profile.longitude.to_f,
      job.latitude.to_f,
      job.longitude.to_f
    )
    miles <= pref.max_distance_miles.to_f
  end

  def self.deliver_email(user:, job:)
    return false unless user.email_notifications_enabled?

    r = MailDelivery.safe_deliver_result { UserMailer.job_alert_email(user, job).deliver_now }
    r[:success] == true
  end

  def self.deliver_sms(user:, job:)
    body = "New #{job.skill_class.presence || 'trade'} job: #{job.title}".truncate(320)
    log = SmsDeliveryLog.create!(
      user_id: user.id,
      category: "job_alert",
      destination: user.phone.to_s,
      message: body,
      status: "queued"
    )

    result = SmsDeliveryService.deliver!(to: user.phone, body: body)
    status =
      case result[:status]
      when :sent then "sent"
      when :skipped then "skipped"
      else "failed"
      end
    log.update!(
      status: status,
      error_message: result[:error].presence
    )
    result[:status] == :sent || result[:status] == :skipped
  rescue StandardError => e
    Rails.logger.warn("JobAlertDispatcher deliver_sms: #{e.message}")
    false
  end

  def self.deliver_app(user:, job:)
    AppNotification.create!(
      user_id: user.id,
      category: "job_alert",
      title: "New matching job",
      body: job.title.to_s,
      metadata: { job_id: job.id, skill_class: job.skill_class, hourly_rate_cents: job.hourly_rate_cents }
    )
    true
  end
end
