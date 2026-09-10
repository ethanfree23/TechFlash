# frozen_string_literal: true

class GhlTechnicianOnboardingService
  Result = Struct.new(:http_status, :body, keyword_init: true)

  REQUIRED_KEYS = %w[ghl_contact_id ghl_location_id idempotency_key phone].freeze

  def self.call(payload)
    new(payload).call
  end

  def initialize(payload)
    @payload = stringify(payload)
  end

  def call
    missing = REQUIRED_KEYS.select { |key| @payload[key].to_s.strip.blank? }
    if missing.any?
      message = "Missing required field(s): #{missing.join(', ')}"
      persist_unprocessed_event(message)
      return failure(:unprocessable_entity, message)
    end

    result = nil
    GhlWebhookEvent.transaction do
      event = GhlWebhookEvent.lock.find_or_initialize_by(idempotency_key: idempotency_key)
      if event.processed_at.present? && replay_user(event).present?
        result = replay_result(event)
      else
        event.processed_at = nil
        event.user_id = nil if replay_user(event).blank?
        result = process_event!(event)
      end
    end
    result
  rescue GhlTechnicianProvisioner::Error, GhlRemoteImageFetcher::Error, GhlProfilePhotoAttacher::Error, GhlDocumentFileAttacher::Error => e
    persist_unprocessed_event(e.message)
    failure(:unprocessable_entity, e.message)
  rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid => e
    message = e.message.to_s
    persist_unprocessed_event(message)
    if message.match?(/ghl_contact_id|unique/i)
      failure(:conflict, "A technician with this GoHighLevel contact already exists")
    else
      failure(:unprocessable_entity, message)
    end
  end

  private

  def process_event!(event)
    prepare_event!(event)

    parsed = GhlIntakeParser.parse(
      email: @payload["email"],
      contact_info: @payload["tf_intake_contact_info"],
      zip_code: @payload["zip_code"],
      postal_code: @payload["postal_code"],
      zip: @payload["zip"]
    )
    names = GhlIntakeParser.split_name(
      full_name: @payload["full_name"],
      first_name: @payload["first_name"],
      last_name: @payload["last_name"]
    )
    phone_normalized = GhlPhoneNormalizer.normalize(@payload["phone"])
    if phone_normalized.blank?
      message = "phone is invalid"
      event.update!(processing_error: message)
      return failure(:unprocessable_entity, message)
    end

    match = GhlTechnicianMatcher.call(
      ghl_contact_id: @payload["ghl_contact_id"],
      email: parsed[:email],
      phone_normalized: phone_normalized
    )
    if match.conflict?
      event.update!(processing_error: match.error)
      return failure(:conflict, match.error)
    end

    if profile_photo_event?
      return process_profile_photo!(event, match)
    end

    if parsed[:email].blank? && match.user.blank?
      message = "email is required (send email or include it in tf_intake_contact_info)"
      event.update!(processing_error: message)
      return failure(:unprocessable_entity, message)
    end

    outcome = GhlTechnicianProvisioner.upsert!(
      user: match.user,
      email: parsed[:email],
      phone: @payload["phone"],
      first_name: names[:first_name],
      last_name: names[:last_name],
      ghl_contact_id: @payload["ghl_contact_id"],
      ghl_location_id: @payload["ghl_location_id"],
      ghl_conversation_id: @payload["ghl_conversation_id"],
      zip_code: parsed[:zip_code],
      trade_type: @payload["primary_trade"].presence || @payload["trade_type"],
      experience_years: GhlIntakeParser.parse_years(
        @payload["years_of_experience"].presence || @payload["experience_years"]
      ),
      skill_class: @payload["technician_level"].presence || @payload["skill_class"],
      has_trade_credential: GhlIntakeParser.parse_boolean(@payload["has_trade_credential"]),
      trade_license_title: @payload["trade_license_title"],
      trade_license_number: @payload["trade_license_number"],
      trade_license_image: fetch_trade_license_image,
      min_hourly_rate_cents: parse_hourly_rate_cents,
      max_distance_miles: GhlIntakeParser.parse_miles(
        @payload["travel_distance"].presence || @payload["max_distance_miles"]
      ),
      tf_intake_contact_info: @payload["tf_intake_contact_info"],
      tf_intake_references: @payload["tf_intake_references"],
      parsed_references: GhlReferenceParser.from_payload(@payload)
    )

    event.update!(
      processed_at: Time.current,
      user_id: outcome[:user].id,
      processing_error: nil
    )

    Result.new(
      http_status: :accepted,
      body: success_body(outcome[:user], outcome[:profile], created: outcome[:created])
    )
  end

  def profile_photo_event?
    @payload["event"].to_s.strip == "profile_photo"
  end

  def process_profile_photo!(event, match)
    if match.user.blank?
      message = "Technician not found for this GoHighLevel contact"
      event.update!(processing_error: message)
      return failure(:unprocessable_entity, message)
    end

    user = match.user
    unless user.technician?
      message = "A #{user.role} account already exists for this email or phone"
      event.update!(processing_error: message)
      return failure(:conflict, message)
    end

    profile = user.technician_profile || user.create_technician_profile!
    photo_url = GhlProfilePhotoUrlExtractor.first_url(@payload)

    if photo_url.blank?
      event.update!(user_id: user.id, processing_error: nil)
      return Result.new(
        http_status: :accepted,
        body: success_body(user, profile, created: false).merge(photo_updated: false)
      )
    end

    fetched = GhlRemoteImageFetcher.fetch(photo_url)
    GhlProfilePhotoAttacher.attach!(profile, fetched)

    event.update!(
      processed_at: Time.current,
      user_id: user.id,
      processing_error: nil
    )

    Result.new(
      http_status: :accepted,
      body: success_body(user, profile.reload, created: false).merge(photo_updated: true)
    )
  end

  def stringify(payload)
    (payload.presence || {}).to_h.stringify_keys
  end

  def idempotency_key
    @payload["idempotency_key"].to_s.strip
  end

  def fetch_trade_license_image
    url = @payload["trade_license_photo_url"].to_s.strip
    return nil if url.blank?

    GhlRemoteImageFetcher.fetch(url)
  end

  def parse_hourly_rate_cents
    if @payload["min_hourly_rate_cents"].present?
      GhlIntakeParser.parse_years(@payload["min_hourly_rate_cents"])
    else
      GhlIntakeParser.parse_money_cents(
        @payload["minimum_hourly_rate"].presence || @payload["min_hourly_rate"]
      )
    end
  end

  def prepare_event!(event)
    event.ghl_contact_id = @payload["ghl_contact_id"].to_s.strip
    event.event_type = @payload["event"].to_s.strip.presence || "technician_onboarding"
    event.payload = @payload
    event.attempt_count = event.attempt_count.to_i + 1
    event.save!
  end

  def persist_unprocessed_event(message)
    key = idempotency_key
    return if key.blank?

    event = GhlWebhookEvent.find_or_initialize_by(idempotency_key: key)
    return if event.processed_at.present? && replay_user(event).present?

    event.ghl_contact_id = @payload["ghl_contact_id"].to_s.strip.presence || event.ghl_contact_id
    event.event_type = @payload["event"].to_s.strip.presence || event.event_type || "technician_onboarding"
    event.payload = @payload
    event.processing_error = message
    event.attempt_count = event.attempt_count.to_i + 1 if event.new_record?
    event.save
  end

  def replay_user(event)
    event.user || User.find_by(id: event.user_id)
  end

  def replay_result(event)
    user = replay_user(event)
    profile = user&.technician_profile
    body = success_body(user, profile, created: false)
    if profile_photo_event? || event.event_type.to_s == "profile_photo"
      body = body.merge(photo_updated: profile&.avatar&.attached? == true)
    end
    Result.new(
      http_status: :ok,
      body: body
    )
  end

  def success_body(user, profile, created:)
    {
      success: true,
      user_id: user&.id,
      technician_profile_id: profile&.id,
      created: created,
      ghl_contact_id: @payload["ghl_contact_id"].to_s.strip.presence || user&.ghl_contact_id
    }
  end

  def failure(status, message)
    Result.new(
      http_status: status,
      body: { success: false, error: message }
    )
  end
end
