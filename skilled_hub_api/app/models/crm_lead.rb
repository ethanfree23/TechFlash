# frozen_string_literal: true

class CrmLead < ApplicationRecord
  CONTACT_ALLOWED_ROOT_KEYS = %w[
    name email phone job_title extension linked_user_id is_primary
    instagram_url facebook_url linkedin_url same_as_company
  ].freeze
  SAME_AS_COMPANY_KEYS = %w[email phone socials].freeze

  STATUSES = %w[lead contacted qualified proposal prospect customer competitor churned lost].freeze
  COMPANY_TYPES = [
    "hvac",
    "plumbing",
    "electrical",
    "refrigeration",
    "fire_protection",
    "general_contracting",
    "handyman",
    "roofing",
    "solar",
    "appliance_repair",
    "facility_maintenance",
    "other"
  ].freeze

  belongs_to :linked_user, class_name: "User", optional: true, inverse_of: :crm_leads
  belongs_to :linked_company_profile, class_name: "CompanyProfile", optional: true
  has_many :crm_notes, -> { order(created_at: :asc) }, dependent: :destroy

  validates :name, presence: true
  validates :status, inclusion: { in: STATUSES }
  validate :company_types_must_be_supported

  validate :linked_target_must_be_company
  validate :contacts_must_be_supported
  validate :contact_linked_users_must_match_company

  before_validation :normalize_company_types!
  before_validation :normalize_contacts!

  private

  def resolved_company_profile_id_for_contacts
    linked_company_profile_id.presence || linked_user&.company_profile&.id
  end

  def contact_linked_users_must_match_company
    return if contacts.blank?

    profile_id = resolved_company_profile_id_for_contacts
    contacts.each_with_index do |raw, idx|
      next unless raw.is_a?(Hash)

      lid_raw = raw["linked_user_id"] || raw[:linked_user_id]
      next if lid_raw.blank?

      lid = lid_raw.to_i
      next if lid <= 0

      if profile_id.blank?
        errors.add(:contacts, "entry #{idx + 1} cannot set linked_user_id before this CRM record is linked to a company")
        next
      end

      u = User.find_by(id: lid)
      unless u&.company? && u.company_profile_id == profile_id
        errors.add(:contacts, "entry #{idx + 1} linked_user_id must be a company login for this CRM lead's company")
      end
    end
  end

  def linked_target_must_be_company
    return if linked_user_id.blank? && linked_company_profile_id.blank?

    if linked_user_id.present?
      u = linked_user
      unless u&.company?
        errors.add(:linked_user_id, "must be a company account")
        return
      end
      if linked_company_profile_id.present? && u.company_profile&.id != linked_company_profile_id
        errors.add(:linked_company_profile_id, "must match the selected company user")
      elsif linked_company_profile_id.blank? && u.company_profile.blank?
        errors.add(:linked_user_id, "has no company profile yet")
      end
    end

    return if linked_company_profile_id.blank?

    unless linked_company_profile
      errors.add(:linked_company_profile_id, "is invalid")
      return
    end

    unless linked_company_profile.company_users.exists?(role: :company) || linked_company_profile.user&.company?
      errors.add(:linked_company_profile_id, "must belong to a company")
    end
  end

  def company_types_must_be_supported
    return if company_types.blank?
    unless company_types.is_a?(Array)
      errors.add(:company_types, "must be an array")
      return
    end

    invalid = company_types - COMPANY_TYPES
    return if invalid.empty?

    errors.add(:company_types, "contains unsupported values: #{invalid.join(', ')}")
  end

  def contacts_must_be_supported
    return if contacts.blank?
    unless contacts.is_a?(Array)
      errors.add(:contacts, "must be an array")
      return
    end

    contacts.each_with_index do |contact, idx|
      unless contact.is_a?(Hash)
        errors.add(:contacts, "entry #{idx + 1} must be an object")
        next
      end

      unsupported = contact.keys.map(&:to_s) - CONTACT_ALLOWED_ROOT_KEYS
      errors.add(:contacts, "entry #{idx + 1} has unsupported keys: #{unsupported.join(', ')}") if unsupported.any?

      sac = contact["same_as_company"] || contact[:same_as_company]
      next if sac.blank?

      unless sac.is_a?(Hash)
        errors.add(:contacts, "entry #{idx + 1} same_as_company must be an object")
        next
      end

      bad_sac = sac.keys.map(&:to_s) - SAME_AS_COMPANY_KEYS
      errors.add(:contacts, "entry #{idx + 1} same_as_company has unsupported keys: #{bad_sac.join(', ')}") if bad_sac.any?
    end
  end

  def normalize_company_types!
    normalized =
      case company_types
      when String
        company_types.split(/[,|;]/)
      when Array
        company_types
      else
        []
      end

    self.company_types = normalized.map { |v| v.to_s.strip.downcase }.reject(&:blank?).uniq
  end

  def normalize_contacts!
    normalized_input =
      case contacts
      when String
        begin
          JSON.parse(contacts)
        rescue JSON::ParserError
          []
        end
      when Array
        contacts
      else
        []
      end

    rows = normalized_input.filter_map do |entry|
      hash = entry.respond_to?(:to_h) ? entry.to_h : {}
      name = hash["name"].to_s.strip.presence || hash[:name].to_s.strip.presence
      email = hash["email"].to_s.strip.presence || hash[:email].to_s.strip.presence
      phone = hash["phone"].to_s.strip.presence || hash[:phone].to_s.strip.presence
      next if name.blank? && email.blank? && phone.blank?

      out = {
        "name" => name,
        "email" => email,
        "phone" => phone
      }.compact

      %w[job_title extension instagram_url facebook_url linkedin_url].each do |k|
        v = hash[k].to_s.strip.presence || hash[k.to_sym].to_s.strip.presence
        out[k] = v if v.present?
      end

      sac_raw = hash["same_as_company"] || hash[:same_as_company]
      if sac_raw.is_a?(Hash)
        sac = {}
        SAME_AS_COMPANY_KEYS.each do |k|
          val = sac_raw[k] || sac_raw[k.to_sym]
          next if val.nil?

          sac[k] = ActiveModel::Type::Boolean.new.cast(val)
        end
        out["same_as_company"] = sac if sac.any? { |_, v| v }
      end

      lid_raw = hash["linked_user_id"] || hash[:linked_user_id]
      if lid_raw.present?
        lid = lid_raw.to_i
        out["linked_user_id"] = lid if lid.positive?
      end

      ip = hash["is_primary"] || hash[:is_primary]
      out["is_primary"] = true if ActiveModel::Type::Boolean.new.cast(ip)

      out
    end

    primary_indices = rows.each_index.select { |i| rows[i]["is_primary"] }
    if primary_indices.empty? && rows.any?
      rows[0]["is_primary"] = true
    elsif primary_indices.length > 1
      keep = primary_indices.first
      rows.each_with_index do |h, i|
        h["is_primary"] = (i == keep)
      end
    elsif primary_indices.any?
      rows.each_with_index do |h, i|
        h["is_primary"] = false unless i == primary_indices.first
      end
    end

    self.contacts = rows
  end
end
