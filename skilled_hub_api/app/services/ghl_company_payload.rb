# frozen_string_literal: true

# Request contract for POST /api/v1/webhooks/ghl/company_onboarding.
#
# This class is the single source of truth for which keys the company onboarding webhook
# accepts and how each one is normalized. GHL_COMPANY_ONBOARDING.md is written from it.
#
# ZIP rule: `business_zip` is the company's business ZIP. It maps to
# CompanyProfile#business_zip_code only. It is never a job ZIP, job address, or work location;
# every job collects its own location through the normal job-posting flow.
class GhlCompanyPayload
  EVENT_TYPE = "company_onboarding"

  # Always required. idempotency_key/ghl ids: without them the event can't be deduplicated
  # or attributed. phone: the funnel is SMS-driven, and CompanyProfile requires a phone on
  # update. Everything else is optional; email + company_name are additionally required only
  # when a new company account has to be created.
  REQUIRED_KEYS = %w[idempotency_key ghl_contact_id ghl_location_id phone].freeze

  IDENTITY_KEYS = %w[
    idempotency_key ghl_contact_id ghl_location_id ghl_conversation_id event
    first_name last_name full_name company_name email phone
  ].freeze

  # Business ZIP aliases. `business_zip` is canonical; `business_zip_code` and
  # `company_zip` are accepted so the GHL mapping can use whichever name is created there.
  # Plain `zip`/`zip_code`/`postal_code` are intentionally NOT accepted here: on this
  # endpoint the only ZIP that exists is the business ZIP, and naming it explicitly keeps it
  # from ever being mistaken for a job location.
  BUSINESS_ZIP_KEYS = %w[business_zip business_zip_code company_zip].freeze

  HIRING_KEYS = %w[
    primary_trade trades_needed staffing_type technicians_needed hiring_timeframe
    technician_level pay_rate pay_range pay_min pay_max
  ].freeze

  ATTRIBUTION_KEYS = %w[
    lead_source meta_lead_id meta_form_id meta_ad_id meta_adset_id meta_campaign_id
    utm_source utm_medium utm_campaign utm_content
  ].freeze

  PERMITTED_KEYS = (IDENTITY_KEYS + BUSINESS_ZIP_KEYS + HIRING_KEYS + ATTRIBUTION_KEYS).freeze

  STAFFING_INTENTS = %w[temporary full_time both].freeze

  STAFFING_ALIASES = {
    "temporary" => "temporary",
    "temp" => "temporary",
    "short term" => "temporary",
    "contract" => "temporary",
    "full time" => "full_time",
    "fulltime" => "full_time",
    "permanent" => "full_time",
    "direct hire" => "full_time",
    "both" => "both",
    "either" => "both",
    "temporary full time" => "both",
    "temp full time" => "both",
    "temp to hire" => "both",
    "temporary or full time" => "both",
    "temporary and full time" => "both"
  }.freeze

  attr_reader :raw, :warnings

  def self.parse(payload)
    new(payload)
  end

  def initialize(payload)
    @raw = (payload.presence || {}).to_h.stringify_keys.slice(*PERMITTED_KEYS)
    @warnings = []
    normalize!
  end

  def missing_required_keys
    REQUIRED_KEYS.select { |key| @raw[key].to_s.strip.blank? }
  end

  def idempotency_key
    str("idempotency_key")
  end

  def ghl_contact_id
    str("ghl_contact_id")
  end

  def ghl_location_id
    str("ghl_location_id")
  end

  def ghl_conversation_id
    str("ghl_conversation_id")
  end

  # Always company_onboarding. An incoming `event` key is accepted but ignored, so a GHL
  # workflow can't reroute this endpoint into another event type's replay semantics.
  def event_type
    EVENT_TYPE
  end

  def company_name
    str("company_name")
  end

  def phone
    str("phone")
  end

  attr_reader :email, :phone_normalized, :first_name, :last_name, :business_zip_code,
              :staffing_intent, :service_trades, :industry, :hiring_context, :attribution

  # Only keys that were actually present and parseable. Callers must not assume every
  # key exists: the funnel may not have collected it yet.
  def to_h
    {
      email: email,
      phone: phone,
      phone_normalized: phone_normalized,
      first_name: first_name,
      last_name: last_name,
      company_name: company_name,
      business_zip_code: business_zip_code,
      staffing_intent: staffing_intent,
      service_trades: service_trades,
      industry: industry,
      hiring_context: hiring_context,
      attribution: attribution
    }
  end

  private

  def normalize!
    @email = GhlIntakeParser.extract_email(@raw["email"])
    @phone_normalized = GhlPhoneNormalizer.normalize(@raw["phone"])

    names = GhlIntakeParser.split_name(
      full_name: @raw["full_name"], first_name: @raw["first_name"], last_name: @raw["last_name"]
    )
    @first_name = names[:first_name]
    @last_name = names[:last_name]

    @business_zip_code = normalize_business_zip
    @staffing_intent = normalize_staffing_intent
    normalize_trades!
    @hiring_context = build_hiring_context
    @attribution = build_attribution
  end

  def normalize_business_zip
    raw_key = BUSINESS_ZIP_KEYS.find { |key| @raw[key].to_s.strip.present? }
    return nil unless raw_key

    zip = GhlIntakeParser.extract_zip(@raw[raw_key])
    warn!("#{raw_key} is not a 5-digit ZIP") if zip.blank?
    zip
  end

  def normalize_staffing_intent
    value = str("staffing_type")
    return nil if value.blank?

    token = value.downcase.gsub(/[^a-z]+/, " ").strip
    intent = STAFFING_INTENTS.include?(token.tr(" ", "_")) ? token.tr(" ", "_") : STAFFING_ALIASES[token]
    warn!("staffing_type '#{value}' is not temporary, full_time, or both") if intent.nil?
    intent
  end

  # Trades feed CompanyProfile#service_trades, which only accepts TradeCatalog labels.
  # Unrecognised trades are kept verbatim in hiring_context so nothing the company typed
  # is lost, but they never reach the validated column.
  def normalize_trades!
    raw_list = [@raw["primary_trade"], *split_list(@raw["trades_needed"])].map { |t| t.to_s.strip }.reject(&:blank?).uniq
    @raw_trades = raw_list
    normalized = raw_list.map { |t| TradeCatalog.normalized_label(t) }
    unknown = raw_list.select.with_index { |_, i| normalized[i].nil? }
    warn!("unrecognised trade(s): #{unknown.join(', ')}") if unknown.any?

    @service_trades = normalized.compact.uniq
    primary = TradeCatalog.normalized_label(@raw["primary_trade"]) || @service_trades.first
    @industry = primary.present? ? TradeCatalog.company_industry_label(primary) : nil
  end

  def build_hiring_context
    level_raw = str("technician_level")
    level = level_raw.present? ? TechnicianClassCatalog.normalized_slug(level_raw) : nil
    warn!("technician_level '#{level_raw}' is not recognised") if level_raw.present? && level.blank?

    {
      "trades_needed" => (@raw_trades.presence),
      "technicians_needed" => GhlIntakeParser.parse_years(@raw["technicians_needed"]),
      "technicians_needed_raw" => (str("technicians_needed") unless str("technicians_needed").to_s.match?(/\A\d*\z/)),
      "hiring_timeframe" => str("hiring_timeframe"),
      "technician_level" => level,
      "technician_level_raw" => (level_raw if level.blank?),
      "pay_rate_cents" => GhlIntakeParser.parse_money_cents(@raw["pay_rate"]),
      "pay_min_cents" => GhlIntakeParser.parse_money_cents(@raw["pay_min"]),
      "pay_max_cents" => GhlIntakeParser.parse_money_cents(@raw["pay_max"]),
      "pay_range" => str("pay_range"),
      "staffing_type_raw" => (str("staffing_type") if @staffing_intent.nil?)
    }.compact
  end

  def build_attribution
    ATTRIBUTION_KEYS.each_with_object({}) do |key, out|
      value = str(key)
      out[key] = value if value.present?
    end
  end

  def split_list(value)
    case value
    when Array then value
    when nil then []
    else value.to_s.split(/[,;|\n]/)
    end
  end

  def str(key)
    value = @raw[key]
    return nil if value.is_a?(Array) || value.is_a?(Hash)

    value.to_s.strip.presence
  end

  def warn!(message)
    @warnings << message
  end
end
