# frozen_string_literal: true

# Handles POST /api/v1/webhooks/ghl/company_onboarding.
#
# Mirrors GhlTechnicianOnboardingService: the same GhlWebhookEvent table, the same
# idempotency-key locking and replay rules, the same Result/http status conventions.
#
# - Same idempotency_key, already processed      -> 200, original result, nothing re-applied.
# - Same idempotency_key, previously failed       -> retried (attempt_count increments).
# - New idempotency_key for a known contact/email -> 202, existing account updated, created: false.
class GhlCompanyOnboardingService
  Result = Struct.new(:http_status, :body, keyword_init: true)

  PASSWORD_SETUP_PATH = "/create-password"

  def self.call(payload)
    new(payload).call
  end

  def initialize(payload)
    @payload = GhlCompanyPayload.parse(payload)
  end

  def call
    missing = @payload.missing_required_keys
    if missing.any?
      message = "Missing required field(s): #{missing.join(', ')}"
      persist_unprocessed_event(message)
      return failure(:unprocessable_entity, message)
    end

    result = nil
    GhlWebhookEvent.transaction do
      event = GhlWebhookEvent.lock.find_or_initialize_by(idempotency_key: @payload.idempotency_key)

      if event.persisted? && event.event_type.present? && event.event_type != GhlCompanyPayload::EVENT_TYPE
        result = failure(:conflict, "idempotency_key was already used for a #{event.event_type} event")
      elsif event.processed_at.present? && replay_user(event).present?
        result = replay_result(event)
      else
        event.processed_at = nil
        event.user_id = nil if replay_user(event).blank?
        result = process_event!(event)
      end
    end
    result
  rescue GhlCompanyProvisioner::Error => e
    persist_unprocessed_event(e.message)
    failure(:unprocessable_entity, e.message)
  rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid => e
    message = e.message.to_s
    persist_unprocessed_event(message)
    if message.match?(/ghl_contact_id|unique/i)
      failure(:conflict, "An account with this GoHighLevel contact already exists")
    else
      failure(:unprocessable_entity, message)
    end
  end

  private

  def process_event!(event)
    prepare_event!(event)

    # A real 10-digit US number: the funnel texts this phone, and a short digit string
    # would otherwise be stored and matched against other accounts.
    if @payload.phone_normalized.to_s.length != 10
      return record_failure(event, :unprocessable_entity, "phone is invalid")
    end

    match = GhlAccountMatcher.call(
      role: :company,
      ghl_contact_id: @payload.ghl_contact_id,
      email: @payload.email,
      phone_normalized: @payload.phone_normalized
    )
    return record_failure(event, :conflict, match.error) if match.conflict?

    if match.user.blank?
      missing = []
      missing << "email" if @payload.email.blank?
      missing << "company_name" if @payload.company_name.blank?
      if missing.any?
        return record_failure(event, :unprocessable_entity, "#{missing.join(' and ')} required to create a company account")
      end
    end

    outcome = GhlCompanyProvisioner.upsert!(user: match.user, payload: @payload)

    event.update!(processed_at: Time.current, user_id: outcome[:user].id, processing_error: nil)

    Result.new(
      http_status: :accepted,
      body: success_body(
        outcome[:user], outcome[:profile],
        crm_lead: outcome[:crm_lead],
        created: outcome[:created],
        matched_by: match.matched_by,
        warnings: @payload.warnings + outcome[:warnings]
      )
    )
  end

  def record_failure(event, status, message)
    event.update!(processing_error: message)
    failure(status, message)
  end

  def prepare_event!(event)
    event.ghl_contact_id = @payload.ghl_contact_id
    event.event_type = GhlCompanyPayload::EVENT_TYPE
    event.payload = @payload.raw
    event.attempt_count = event.attempt_count.to_i + 1
    event.save!
  end

  def persist_unprocessed_event(message)
    key = @payload.idempotency_key
    return if key.blank?

    event = GhlWebhookEvent.find_or_initialize_by(idempotency_key: key)
    return if event.processed_at.present? && replay_user(event).present?
    return if event.persisted? && event.event_type.present? && event.event_type != GhlCompanyPayload::EVENT_TYPE

    event.ghl_contact_id = @payload.ghl_contact_id || event.ghl_contact_id
    event.event_type = GhlCompanyPayload::EVENT_TYPE
    event.payload = @payload.raw
    event.processing_error = message
    event.attempt_count = event.attempt_count.to_i + 1 if event.new_record?
    event.save
  end

  def replay_user(event)
    event.user || User.find_by(id: event.user_id)
  end

  def replay_result(event)
    user = replay_user(event)
    profile = user&.company_profile
    lead = profile && CrmLead.where(linked_company_profile_id: profile.id).order(updated_at: :desc, id: :desc).first
    Result.new(
      http_status: :ok,
      body: success_body(user, profile, crm_lead: lead, created: false, matched_by: nil, warnings: []).merge(replayed: true)
    )
  end

  def success_body(user, profile, crm_lead:, created:, matched_by:, warnings:)
    {
      success: true,
      user_id: user&.id,
      company_profile_id: profile&.id,
      crm_lead_id: crm_lead&.id,
      created: created,
      matched_by: matched_by,
      ghl_contact_id: @payload.ghl_contact_id || user&.ghl_contact_id,
      staffing_intent: profile&.staffing_intent,
      password_setup_required: user&.first_time_password_setup_eligible? == true,
      password_setup_path: (PASSWORD_SETUP_PATH if user&.first_time_password_setup_eligible?),
      warnings: warnings.uniq
    }
  end

  def failure(status, message)
    Result.new(http_status: status, body: { success: false, error: message })
  end
end
