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
      if event.processed_at.present?
        result = replay_result(event)
      else
        result = process_event!(event)
      end
    end
    result
  rescue GhlTechnicianProvisioner::Error => e
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
      contact_info: @payload["tf_intake_contact_info"]
    )
    if parsed[:email].blank?
      message = "email is required (send email or include it in tf_intake_contact_info)"
      event.update!(processing_error: message)
      return failure(:unprocessable_entity, message)
    end

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

    outcome = GhlTechnicianProvisioner.upsert!(
      user: match.user,
      email: parsed[:email],
      phone: @payload["phone"],
      first_name: @payload["first_name"],
      last_name: @payload["last_name"],
      ghl_contact_id: @payload["ghl_contact_id"],
      ghl_location_id: @payload["ghl_location_id"],
      ghl_conversation_id: @payload["ghl_conversation_id"],
      zip_code: parsed[:zip_code],
      tf_intake_contact_info: @payload["tf_intake_contact_info"],
      tf_intake_references: @payload["tf_intake_references"],
      parsed_references: GhlReferenceParser.parse(@payload["tf_intake_references"])
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

  def stringify(payload)
    (payload.presence || {}).to_h.stringify_keys
  end

  def idempotency_key
    @payload["idempotency_key"].to_s.strip
  end

  def prepare_event!(event)
    event.ghl_contact_id = @payload["ghl_contact_id"].to_s.strip
    event.event_type = "technician_onboarding"
    event.payload = @payload
    event.attempt_count = event.attempt_count.to_i + 1
    event.save!
  end

  def persist_unprocessed_event(message)
    key = idempotency_key
    return if key.blank?

    event = GhlWebhookEvent.find_or_initialize_by(idempotency_key: key)
    return if event.processed_at.present?

    event.ghl_contact_id = @payload["ghl_contact_id"].to_s.strip.presence || event.ghl_contact_id
    event.event_type ||= "technician_onboarding"
    event.payload = @payload
    event.processing_error = message
    event.attempt_count = event.attempt_count.to_i + 1 if event.new_record?
    event.save
  end

  def replay_result(event)
    user = event.user || User.find_by(id: event.user_id)
    profile = user&.technician_profile
    Result.new(
      http_status: :ok,
      body: success_body(user, profile, created: false)
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
