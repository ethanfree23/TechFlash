# frozen_string_literal: true

class CrmLead < ApplicationRecord
  STATUSES = %w[lead contacted qualified proposal prospect customer competitor churned lost].freeze

  belongs_to :linked_user, class_name: "User", optional: true, inverse_of: :crm_leads
  belongs_to :linked_company_profile, class_name: "CompanyProfile", optional: true

  validates :name, presence: true
  validates :status, inclusion: { in: STATUSES }

  validate :linked_target_must_be_company

  private

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
end
