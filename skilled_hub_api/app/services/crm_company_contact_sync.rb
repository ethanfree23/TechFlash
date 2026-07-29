# frozen_string_literal: true

class CrmCompanyContactSync
  class << self
    def sync_user!(user:, company_profile: nil)
      new(user: user, company_profile: company_profile).sync!
    end

    def sync_user_safely!(user:, company_profile: nil)
      sync_user!(user: user, company_profile: company_profile)
      true
    rescue StandardError => e
      Rails.logger.warn("CrmCompanyContactSync failed for user_id=#{user&.id}: #{e.class}: #{e.message}")
      false
    end
  end

  def initialize(user:, company_profile: nil)
    @user = user
    @company_profile = company_profile
  end

  def sync!
    return false unless syncable_user?

    profile = resolved_company_profile
    return false if profile.blank?

    lead = find_lead_for(profile: profile)
    return false if lead.blank?

    lead.with_lock do
      lead.reload
      updated_contacts = upsert_contact(Array(lead.contacts))
      return false if updated_contacts == Array(lead.contacts)

      lead.update!(contacts: updated_contacts)
    end

    true
  end

  private

  attr_reader :user, :company_profile

  def syncable_user?
    user.present? && user.company?
  end

  def resolved_company_profile
    company_profile.presence || user.company_profile
  end

  def find_lead_for(profile:)
    lead = CrmLead.where(linked_company_profile_id: profile.id).order(updated_at: :desc, id: :desc).first
    return lead if lead.present?

    company_user_ids = profile.company_users.where(role: :company).pluck(:id)
    if profile.user&.company?
      company_user_ids << profile.user_id
      company_user_ids.uniq!
    end
    return nil if company_user_ids.empty?

    CrmLead.where(linked_user_id: company_user_ids).order(updated_at: :desc, id: :desc).first
  end

  def upsert_contact(contacts)
    rows = contacts.map { |entry| normalize_contact(entry) }.compact
    idx = find_existing_contact_index(rows)
    attrs = user_contact_attrs

    if idx
      existing = rows[idx]
      rows[idx] = existing.merge(attrs).compact
    else
      rows << attrs.compact
    end

    rows
  end

  def normalize_contact(entry)
    hash = entry.respond_to?(:to_h) ? entry.to_h.stringify_keys : {}
    name = normalized_string(hash["name"])
    email = normalized_email(hash["email"])
    phone = normalized_string(hash["phone"])
    return nil if name.blank? && email.blank? && phone.blank?

    out = hash.slice(
      "name",
      "email",
      "phone",
      "job_title",
      "extension",
      "instagram_url",
      "facebook_url",
      "linkedin_url",
      "same_as_company",
      "linked_user_id",
      "is_primary"
    )
    out["name"] = name if name.present?
    out["email"] = email if email.present?
    out["phone"] = phone if phone.present?
    if out["linked_user_id"].present?
      lid = out["linked_user_id"].to_i
      out["linked_user_id"] = lid.positive? ? lid : nil
    end
    out.compact
  end

  def find_existing_contact_index(rows)
    linked_idx = rows.index { |entry| entry["linked_user_id"].to_i == user.id }
    return linked_idx if linked_idx

    target_email = normalized_email(user.email)
    return nil if target_email.blank?

    rows.index { |entry| normalized_email(entry["email"]) == target_email }
  end

  def user_contact_attrs
    {
      "linked_user_id" => user.id,
      "name" => user_full_name,
      "email" => normalized_email(user.email),
      "phone" => normalized_string(user.phone)
    }
  end

  def user_full_name
    full = [user.first_name, user.last_name].map { |v| normalized_string(v) }.compact.join(" ").strip
    full.presence
  end

  def normalized_email(value)
    v = value.to_s.strip.downcase
    v.presence
  end

  def normalized_string(value)
    value.to_s.strip.presence
  end
end
