# frozen_string_literal: true

# Creates or updates the company user, company profile, and CRM lead for a GHL company
# onboarding event. Company-side counterpart of GhlTechnicianProvisioner.
#
# Existing accounts are preserved:
# - an existing user's email (login identity) and password are never changed;
# - identity/profile fields are only filled where currently blank;
# - funnel context (staffing_intent, hiring_context) takes the latest non-blank values,
#   because it describes the company's current hiring need;
# - acquisition attribution is first-touch: existing keys are never overwritten.
#
# Nothing here creates a job, touches job location fields, or sets potential_full_time.
class GhlCompanyProvisioner
  class Error < StandardError; end

  CRM_PRE_PROSPECT_STATUSES = %w[lead contacted qualified proposal].freeze
  CRM_ONBOARDED_STATUS = "prospect"

  # TradeCatalog label -> CrmLead::COMPANY_TYPES slug. Trades with no CRM equivalent are skipped.
  CRM_COMPANY_TYPE_FOR_TRADE = {
    "HVAC Technician" => "hvac",
    "Plumber" => "plumbing",
    "Electrician" => "electrical",
    "Refrigeration Technician" => "refrigeration",
    "Fire Protection / Sprinkler Tech" => "fire_protection",
    "Roofer" => "roofing",
    "Solar Installer" => "solar",
    "Appliance Repair Tech" => "appliance_repair"
  }.freeze

  def self.upsert!(user:, payload:)
    new(user: user, payload: payload).upsert!
  end

  def initialize(user:, payload:)
    @existing_user = user
    @payload = payload
    @warnings = []
  end

  def upsert!
    created = @existing_user.blank?
    user = @existing_user || User.new(role: :company)
    profile = nil
    crm_lead = nil

    ActiveRecord::Base.transaction do
      assign_user_attributes!(user, created: created)
      user.save!

      profile = user.company_profile || CompanyProfile.new(user: user)
      profile_created = profile.new_record?
      assign_profile_attributes!(profile, created: profile_created)
      profile.save!
      user.update_column(:company_profile_id, profile.id) if user.company_profile_id.blank?

      crm_lead = upsert_crm_lead(user, profile)
    end

    CrmCompanyContactSync.sync_user_safely!(user: user, company_profile: profile) if crm_lead

    { user: user.reload, profile: profile.reload, crm_lead: crm_lead&.reload, created: created, warnings: @warnings }
  rescue ActiveRecord::RecordInvalid => e
    raise Error, e.record.errors.full_messages.to_sentence.presence || e.message
  end

  private

  def assign_user_attributes!(user, created:)
    if created
      # Unusable internal password. The company never receives this value.
      # First-time login is via /create-password after email verification.
      # Do not use email, phone, ZIP, name, or any other predictable default.
      password = SecureRandom.urlsafe_base64(32)
      user.password = password
      user.password_confirmation = password
      user.password_set_actor = "system"
      user.role = :company
      user.email = @payload.email
      user.ghl_onboarded_at = Time.current
    else
      user.ghl_onboarded_at ||= Time.current
      if @payload.email.present? && user.email.to_s.downcase != @payload.email
        @warnings << "email differs from the existing account; account email left unchanged"
      end
    end

    fill_blank(user, :phone, @payload.phone)
    fill_blank(user, :first_name, @payload.first_name)
    fill_blank(user, :last_name, @payload.last_name)
    fill_blank(user, :ghl_location_id, @payload.ghl_location_id)
    fill_blank(user, :ghl_conversation_id, @payload.ghl_conversation_id)

    if user.ghl_contact_id.blank?
      user.ghl_contact_id = @payload.ghl_contact_id
    elsif user.ghl_contact_id != @payload.ghl_contact_id
      @warnings << "account is already linked to a different GHL contact; link left unchanged"
    end
  end

  def assign_profile_attributes!(profile, created:)
    if created
      profile.membership_level = MembershipPolicy.default_slug_for("company")
    end

    fill_blank(profile, :company_name, @payload.company_name)
    fill_blank(profile, :industry, @payload.industry)
    fill_blank(profile, :phone, @payload.phone)
    fill_blank(profile, :business_zip_code, @payload.business_zip_code)
    profile.service_trades = @payload.service_trades if Array(profile.service_trades).empty? && @payload.service_trades.present?

    profile.staffing_intent = @payload.staffing_intent if @payload.staffing_intent.present?
    profile.hiring_context = hash_of(profile.hiring_context).merge(@payload.hiring_context)
    profile.acquisition_attribution = merged_attribution(profile)
  end

  def merged_attribution(profile)
    existing = hash_of(profile.acquisition_attribution)
    incoming = @payload.attribution.merge(
      "ghl_contact_id" => @payload.ghl_contact_id,
      "ghl_location_id" => @payload.ghl_location_id,
      "first_onboarded_at" => Time.current.iso8601
    ).compact
    # First touch wins for every key; only the last-seen timestamp moves.
    incoming.merge(existing).merge("last_onboarded_at" => Time.current.iso8601)
  end

  # The CRM lead is admin-side bookkeeping for the acquisition pipeline. A CRM problem must
  # never cost the company its account, so it runs in a savepoint and degrades to a warning.
  def upsert_crm_lead(user, profile)
    CrmLead.transaction(requires_new: true) do
      lead = find_crm_lead(user, profile) || CrmLead.new(status: CRM_ONBOARDED_STATUS)
      lead.name = lead.name.presence || profile.company_name.presence || fallback_lead_name(user)
      lead.linked_user_id ||= user.id
      lead.linked_company_profile_id ||= profile.id
      lead.status = CRM_ONBOARDED_STATUS if CRM_PRE_PROSPECT_STATUSES.include?(lead.status)
      fill_blank(lead, :contact_name, [user.first_name, user.last_name].compact.join(" "))
      fill_blank(lead, :email, user.email)
      fill_blank(lead, :phone, user.phone)
      fill_blank(lead, :zip, profile.business_zip_code)
      types = @payload.service_trades.filter_map { |t| CRM_COMPANY_TYPE_FOR_TRADE[t] }
      lead.company_types = (Array(lead.company_types) + types).uniq if types.any?
      lead.save!
      lead.crm_notes.create!(contact_method: "note", title: "GHL company onboarding", body: onboarding_note_body)
      lead
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
    Rails.logger.warn("[ghl_company_onboarding] CRM lead upsert failed user_id=#{user.id}: #{e.message}")
    @warnings << "CRM lead could not be updated: #{e.message}"
    nil
  end

  def find_crm_lead(user, profile)
    CrmLead.where(linked_company_profile_id: profile.id).order(updated_at: :desc, id: :desc).first ||
      CrmLead.where(linked_user_id: user.id).order(updated_at: :desc, id: :desc).first ||
      unlinked_lead_for_email(user.email)
  end

  # Adopts a lead the team was already prospecting (e.g. imported by email) instead of
  # creating a duplicate. Only unlinked leads are adopted; a lead linked to another
  # company is never re-pointed.
  def unlinked_lead_for_email(email)
    return nil if email.blank?

    CrmLead.where(linked_user_id: nil, linked_company_profile_id: nil)
           .where("LOWER(email) = :e OR LOWER(company_email) = :e", e: email.downcase)
           .order(updated_at: :desc, id: :desc).first
  end

  def fallback_lead_name(user)
    [user.first_name, user.last_name].compact.join(" ").presence || user.email
  end

  def onboarding_note_body
    ctx = @payload.hiring_context
    [
      ("Staffing: #{@payload.staffing_intent.tr('_', '-')}" if @payload.staffing_intent),
      ("Trades: #{Array(ctx['trades_needed']).join(', ')}" if ctx["trades_needed"].present?),
      ("Technicians needed: #{ctx['technicians_needed_raw'] || ctx['technicians_needed']}" if ctx["technicians_needed"] || ctx["technicians_needed_raw"]),
      ("Timeframe: #{ctx['hiring_timeframe']}" if ctx["hiring_timeframe"]),
      ("Level: #{ctx['technician_level'] || ctx['technician_level_raw']}" if ctx["technician_level"] || ctx["technician_level_raw"]),
      ("Pay: #{ctx['pay_range']}" if ctx["pay_range"]),
      ("Business ZIP: #{@payload.business_zip_code}" if @payload.business_zip_code),
      ("Source: #{@payload.attribution['lead_source']}" if @payload.attribution["lead_source"]),
      ("Meta lead: #{@payload.attribution['meta_lead_id']}" if @payload.attribution["meta_lead_id"])
    ].compact.join("\n").presence || "Onboarded from GHL."
  end

  def hash_of(value)
    value.is_a?(Hash) ? value.stringify_keys : {}
  end

  def fill_blank(record, field, value)
    return if value.nil?

    cleaned = value.is_a?(String) ? value.strip : value
    return if cleaned.blank?
    return if record.public_send(field).present?

    record.public_send("#{field}=", cleaned)
  end
end
