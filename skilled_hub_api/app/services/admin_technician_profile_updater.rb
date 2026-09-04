# frozen_string_literal: true

# Admin-only technician onboarding/profile write path.
# Reuses users, technician_profiles, job_alert_preferences, documents, and verification_references.
class AdminTechnicianProfileUpdater
  TRADE_LICENSE_DOC_TYPES = %w[license certificate cert].freeze
  DEFAULT_LICENSE_DOC_TYPE = "certificate"
  MAX_REFERENCES = 3
  DEFAULT_RELATIONSHIP = "Professional reference"

  def self.call(user:, params:, user_attrs: {})
    new(user: user, params: params, user_attrs: user_attrs).call
  end

  def initialize(user:, params:, user_attrs: {})
    @user = user
    @params = params
    @user_attrs = user_attrs.to_h.with_indifferent_access
  end

  def call
    ActiveRecord::Base.transaction do
      apply_user_attrs!
      profile = ensure_profile!
      apply_profile_attrs!(profile)
      apply_job_alert_prefs!
      attach_avatar!(profile)
      apply_trade_license!(profile)
      sync_references!
    end
    { ok: true }
  rescue ActiveRecord::RecordInvalid => e
    { ok: false, errors: e.record.errors.full_messages.presence || [e.message] }
  rescue ActiveRecord::RecordNotUnique => e
    { ok: false, errors: unique_constraint_errors(e) }
  rescue ArgumentError => e
    { ok: false, errors: [e.message] }
  end

  private

  attr_reader :user, :params, :user_attrs

  def apply_user_attrs!
    attrs = user_attrs.dup
    if params.key?(:email)
      email = params[:email].to_s.strip.downcase.presence
      attrs[:email] = email
    end
    user.update!(attrs) if attrs.any?
  end

  def ensure_profile!
    profile = user.technician_profile || user.build_technician_profile
    profile.phone = user.phone if profile.phone.blank? && user.phone.present?
    profile
  end

  def apply_profile_attrs!(profile)
    attrs = technician_attrs
    country = attrs[:country].presence || profile.country
    if CoordinateValidator.valid?(attrs[:latitude], attrs[:longitude], country: country)
      profile.client_coordinates_provided = true
    else
      profile.client_coordinates_provided = false
      attrs.delete(:latitude)
      attrs.delete(:longitude)
    end
    profile.assign_attributes(attrs) if attrs.any?

    # Keep account and profile phone aligned when admin edits the single contact phone.
    if user_attrs.key?(:phone) && !attrs.key?(:phone)
      profile.phone = user_attrs[:phone]
    end
    profile.save!
  end

  def technician_attrs
    permitted = params.permit(
      :trade_type,
      :skill_class,
      :location,
      :availability,
      :bio,
      :phone,
      :experience_years,
      :address,
      :city,
      :state,
      :zip_code,
      :country,
      :latitude,
      :longitude,
      :place_id
    )
    p = permitted.to_h.with_indifferent_access
    if p.key?(:experience_years)
      raw = p[:experience_years]
      p[:experience_years] = raw.present? ? raw.to_i : nil
    end
    if p.key?(:skill_class)
      p[:skill_class] = p[:skill_class].to_s.strip.presence
    end
    if p.key?(:trade_type)
      raw = p[:trade_type].to_s.strip.presence
      p[:trade_type] = TradeCatalog.normalized_label(raw) || raw
    end
    %i[phone location availability bio address city state zip_code country place_id].each do |key|
      next unless p.key?(key)

      p[key] = p[key].is_a?(String) ? p[key].strip.presence : p[key]
    end
    p
  end

  def apply_job_alert_prefs!
    pref_attrs = {}
    if params.key?(:job_alert_trade_label)
      pref_attrs[:trade_label] = params[:job_alert_trade_label].to_s.strip.presence
    end
        if params.key?(:min_hourly_rate_cents)
      raw = params[:min_hourly_rate_cents]
      pref_attrs[:min_hourly_rate_cents] = raw.present? ? Integer(raw) : 0
    end
    if params.key?(:max_distance_miles)
      raw = params[:max_distance_miles]
      pref_attrs[:max_distance_miles] = raw.present? ? Integer(raw) : 200
    end
    return if pref_attrs.empty?

    pref = user.job_alert_preference || JobAlertDispatcher.default_preference_for(user)
    pref.update!(pref_attrs)
  rescue ArgumentError, TypeError
    raise ArgumentError, "Job preference values must be numbers"
  end

  def attach_avatar!(profile)
    file = params[:avatar].presence || params[:profile_photo].presence
    return unless uploaded_file?(file)

    profile.avatar.purge if profile.avatar.attached?
    profile.avatar.attach(file)
    profile.updated_at = Time.current
    profile.save!
  end

  def apply_trade_license!(profile)
    file = params[:license_file].presence
    number = string_param(:license_document_number)
    issuer = string_param(:license_issuer)
    return if file.blank? && !params.key?(:license_document_number) && !params.key?(:license_issuer)

    doc = latest_trade_license(profile)
    if doc.nil?
      return if file.blank? && number.blank? && issuer.blank?

      doc = profile.documents.build(doc_type: DEFAULT_LICENSE_DOC_TYPE, status: :pending_review)
    end

    doc.document_number = number if params.key?(:license_document_number)
    doc.issuer = issuer if params.key?(:license_issuer)
    if uploaded_file?(file)
      doc.file.purge if doc.file.attached?
      doc.file.attach(file)
    end
    doc.save!
  end

  def latest_trade_license(profile)
    profile.documents.where(doc_type: TRADE_LICENSE_DOC_TYPES).order(created_at: :desc, id: :desc).first
  end

  def sync_references!
    return unless params.key?(:references)

    submitted = parse_references
    if submitted.length > MAX_REFERENCES
      raise ArgumentError, "A technician can have at most #{MAX_REFERENCES} professional references"
    end

    existing = user.verification_references_as_technician.to_a
    keep_ids = submitted.filter_map { |row| row[:id].presence&.to_i }
    existing.reject { |ref| keep_ids.include?(ref.id) }.each(&:destroy!)

    submitted.each do |row|
      ref =
        if row[:id].present?
          user.verification_references_as_technician.find_by(id: row[:id].to_i)
        end
      ref ||= user.verification_references_as_technician.build(
        status: :requested,
        requested_at: Time.current,
        relationship: DEFAULT_RELATIONSHIP
      )

      ref.full_name = row[:full_name]
      ref.email = row[:email]
      ref.phone = row[:phone]
      ref.company_name = row[:company_name]
      if row[:relationship].present?
        ref.relationship = row[:relationship]
      elsif ref.relationship.blank?
        ref.relationship = DEFAULT_RELATIONSHIP
      end
      ref.save!
    end
  end

  def parse_references
    raw = params[:references]
    list =
      case raw
      when String
        parsed = JSON.parse(raw)
        parsed.is_a?(Array) ? parsed : []
      when Array
        raw
      when ActionController::Parameters
        raw.to_unsafe_h.sort_by { |k, _| k.to_s.to_i }.map { |_, v| v }
      else
        []
      end

    list.filter_map do |item|
      hash = item.respond_to?(:to_unsafe_h) ? item.to_unsafe_h : item
      hash = hash.with_indifferent_access
      full_name = hash[:full_name].to_s.strip
      next if full_name.blank?

      email = hash[:email].to_s.strip.presence
      phone = hash[:phone].to_s.strip.presence
      if email.blank? && phone.blank?
        raise ArgumentError, "Each reference needs an email or phone"
      end

      {
        id: hash[:id].presence,
        full_name: full_name,
        email: email,
        phone: phone,
        company_name: hash[:company_name].to_s.strip.presence,
        relationship: hash[:relationship].to_s.strip.presence
      }
    end
  rescue JSON::ParserError
    raise ArgumentError, "References payload is invalid"
  end

  def string_param(key)
    return nil unless params.key?(key)

    params[key].to_s.strip.presence
  end

  def uploaded_file?(value)
    return false if value.blank?

    value.respond_to?(:tempfile) || value.respond_to?(:original_filename)
  end

  def unique_constraint_errors(error)
    message = error.message.to_s
    if message.include?("email_normalized")
      ["Email has already been used for another reference"]
    elsif message.include?("phone_normalized")
      ["Phone has already been used for another reference"]
    else
      ["Unable to save because a unique value is already in use"]
    end
  end
end
