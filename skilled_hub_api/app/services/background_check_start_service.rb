class BackgroundCheckStartService
  class Error < StandardError; end

  def self.launch_checkr_invitation!(background_check)
    new(background_check: background_check).launch_checkr_invitation!
  end

  def self.create_checkout_session!(background_check)
    new(background_check: background_check).create_checkout_session!
  end

  def initialize(background_check:)
    @background_check = background_check
    @user = background_check.user
  end

  def launch_checkr_invitation!
    if defined?(StagingSandbox) && StagingSandbox.simulate_checkr?
      StagingSandbox.log_blocked("checkr", "background_check_id=#{@background_check.id}")
      invitation = {
        "id" => "inv_staging_#{SecureRandom.hex(6)}",
        "candidate_id" => "cand_staging_#{SecureRandom.hex(6)}",
        "status" => "pending"
      }
      persist_invitation_state!(invitation: invitation, candidate_id: invitation["candidate_id"])
      VerificationProfile.for_user!(@user).update!(background_status: :pending)
      return invitation
    end

    client = CheckrClient.new
    raise Error, "Checkr is not configured." unless client.configured?

    candidate_id = reusable_candidate_id(client)
    candidate_id ||= create_candidate_for_checkr(client)

    invitation = create_invitation_for_checkr(client, candidate_id: candidate_id)
  rescue CheckrClient::Error => e
    # Some Checkr candidates can fail invitation creation with "email is missing".
    # Rebuild candidate once and retry, even if we did not reuse a legacy candidate.
    if invitation_retryable_for_email?(e.message)
      begin
        candidate_id = create_candidate_for_checkr(client, force_unique_custom_id: true)
        invitation = create_invitation_for_checkr(client, candidate_id: candidate_id)
      rescue CheckrClient::Error => retry_error
        @background_check.update!(status: :failed, admin_notes: retry_error.message)
        raise Error, retry_error.message
      end
    else
      @background_check.update!(status: :failed, admin_notes: e.message)
      raise Error, e.message
    end
  ensure
    if invitation.present?
      persist_invitation_state!(invitation: invitation, candidate_id: candidate_id)
      VerificationProfile.for_user!(@user).update!(background_status: :pending)
      VerificationEventNotifier.background_check_started(@user, @background_check)
    end
  end

  # Legacy path retained for historical Stripe-paid checks only. New technician
  # initiations must not call this — TechFlash absorbs Checkr report costs.
  def create_checkout_session!
    raise Error, "Technician background-check checkout is disabled. TechFlash pays Checkr directly."
  end

  private

  def frontend_base_url
    ENV.fetch("FRONTEND_URL", "http://localhost:5173").to_s.chomp("/")
  end

  def background_check_fee_cents
    ENV.fetch("BACKGROUND_CHECK_FEE_CENTS", "8000").to_i
  end

  def checkout_success_path
    "#{settings_base_path}?tab=verification&background_check=paid"
  end

  def checkout_cancel_path
    "#{settings_base_path}?tab=verification&background_check=cancel"
  end

  def settings_base_path
    "#{demo_frontend_prefix}/settings"
  end

  def demo_frontend_prefix
    return "/demo" if Rails.env.to_s == "demo" || ActiveModel::Type::Boolean.new.cast(ENV["DEMO_MODE"])

    ""
  end

  def work_location_payload
    profile = @user.technician_profile
    country = @background_check.work_location_country.to_s.strip.presence || profile&.country.to_s.strip.presence
    state = @background_check.work_location_state.to_s.strip.presence || profile&.state.to_s.strip.presence
    city = @background_check.work_location_city.to_s.strip.presence || profile&.city.to_s.strip.presence
    raise Error, "Work location country and state are required on the technician profile before starting a background check." if country.blank? || state.blank?

    { country: country, state: state, city: city }.compact
  end

  def candidate_zipcode
    @user.technician_profile&.zip_code.presence
  end

  def create_candidate_for_checkr(client, force_unique_custom_id: false)
    custom_id = candidate_custom_id(force_unique: force_unique_custom_id)
    candidate = client.create_candidate(
      user: @user,
      work_location: work_location_payload,
      custom_id: custom_id,
      zipcode: candidate_zipcode,
      phone: @user.phone.to_s.presence
    )
    candidate["id"]
  rescue CheckrClient::Error => e
    mark_invitation_outcome_unknown!(e) if ambiguous_checkr_error?(e)
    raise
  end

  def create_invitation_for_checkr(client, candidate_id:)
    client.create_invitation(
      candidate_id: candidate_id,
      package_name: @background_check.package_name,
      redirect_url: ENV["CHECKR_REDIRECT_URL"].presence || "#{frontend_base_url}#{settings_base_path}",
      work_location: work_location_payload,
      node_custom_id: @background_check.node_custom_id.presence
    )
  rescue CheckrClient::Error => e
    mark_invitation_outcome_unknown!(e) if ambiguous_checkr_error?(e)
    raise
  end

  def ambiguous_checkr_error?(error)
    message = error.message.to_s
    message.match?(/timeout|timed out|connection|5\d\d|EOF|reset/i)
  end

  def mark_invitation_outcome_unknown!(error)
    @background_check.update!(
      status: :failed,
      normalized_status: "not_started",
      admin_notes: "INVITATION_OUTCOME_UNKNOWN: #{error.message.to_s.truncate(400)}"
    )
  end

  def persist_invitation_state!(invitation:, candidate_id:)
    @background_check.update!(
      provider_candidate_id: candidate_id,
      provider_invitation_id: invitation["id"],
      invitation_url: invitation["invitation_url"] || invitation["url"],
      provider_status: invitation["status"] || "invitation_sent",
      normalized_status: "invitation_sent",
      status: :invited,
      started_at: Time.current
    )
  end

  def invitation_retryable_for_email?(message)
    message.to_s.match?(/email is missing/i)
  end

  def reusable_candidate_id(client)
    candidate_id = @background_check.provider_candidate_id.presence ||
      @user.background_checks.where.not(provider_candidate_id: nil).order(created_at: :desc).pick(:provider_candidate_id)
    return nil if candidate_id.blank?

    candidate = client.get_candidate(candidate_id: candidate_id)
    return nil unless candidate_reusable_for_user?(candidate)

    candidate_id
  rescue CheckrClient::Error
    nil
  end

  def candidate_custom_id(force_unique:)
    base = "techflash_user_#{@user.id}"
    return base unless force_unique

    "#{base}_retry_#{SecureRandom.hex(6)}"
  end

  def candidate_reusable_for_user?(candidate)
    candidate_email = candidate["email"].to_s.strip.downcase
    user_email = @user.email.to_s.strip.downcase
    return false if candidate_email.blank?
    return true if user_email.blank?

    candidate_email == user_email
  end
end
