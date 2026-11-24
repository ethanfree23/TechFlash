# frozen_string_literal: true

# Persistent guided-onboarding progress for technicians.
# Section eligibility is derived from live account data; this record stores wizard
# progress, completion timestamps, admin re-require, and grandfathering only.
class TechnicianOnboarding < ApplicationRecord
  STATUSES = %w[not_started in_progress completed].freeze
  SECTIONS = %w[welcome profile verification notifications billing membership review].freeze
  ONBOARDING_VERSION = 1

  belongs_to :user
  belongs_to :required_by_admin, class_name: "User", optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :user_id, uniqueness: true
  validate :user_must_be_technician

  before_validation :normalize_json_columns

  def self.ensure_for!(user)
    return nil unless user&.technician?

    find_or_create_by!(user_id: user.id) do |record|
      record.status = "not_started"
      record.onboarding_version = ONBOARDING_VERSION
      record.completed_sections = []
      record.section_statuses = {}
      record.metadata = {}
    end
  end

  def completed?
    status == "completed" && completed_at.present? && required_by_admin_at.blank?
  end

  def in_progress?
    status == "in_progress"
  end

  def not_started?
    status == "not_started"
  end

  def mark_started!(section: "welcome", substep: nil)
    attrs = {
      status: "in_progress",
      current_section: section,
      current_substep: substep,
      last_activity_at: Time.current,
      updated_at: Time.current
    }
    attrs[:started_at] = Time.current if started_at.blank?
    update!(attrs)
  end

  def mark_progress!(section:, substep: nil, completed_section: nil)
    sections = Array(completed_sections).map(&:to_s)
    sections << completed_section.to_s if completed_section.present?
    sections = sections.uniq

    mark_started!(section: section, substep: substep)
    update!(
      completed_sections: sections,
      last_activity_at: Time.current
    )
  end

  def mark_completed!
    update!(
      status: "completed",
      completed_at: Time.current,
      current_section: "review",
      current_substep: "done",
      completed_sections: (Array(completed_sections) + SECTIONS).uniq,
      required_by_admin_at: nil,
      required_by_admin_id: nil,
      last_activity_at: Time.current
    )
  end

  def require_again!(admin:)
    update!(
      status: "in_progress",
      completed_at: nil,
      grandfathered_at: nil,
      grandfather_reason: nil,
      required_by_admin_at: Time.current,
      required_by_admin_id: admin&.id,
      current_section: "welcome",
      current_substep: nil,
      last_activity_at: Time.current,
      metadata: metadata_hash.merge(
        "last_required_by_admin_at" => Time.current.iso8601,
        "last_required_by_admin_id" => admin&.id
      )
    )
  end

  def mark_grandfathered!(reason:)
    update!(
      status: "completed",
      completed_at: Time.current,
      grandfathered_at: Time.current,
      grandfather_reason: reason.to_s.presence || "established_account",
      current_section: "review",
      current_substep: "grandfathered",
      completed_sections: SECTIONS,
      required_by_admin_at: nil,
      required_by_admin_id: nil,
      last_activity_at: Time.current
    )
  end

  def metadata_hash
    raw = metadata
    return {} unless raw.is_a?(Hash)

    raw.stringify_keys
  end

  private

  def user_must_be_technician
    return if user.blank?
    return if user.technician?

    errors.add(:user, "must be a technician")
  end

  def normalize_json_columns
    self.completed_sections = Array(completed_sections).map(&:to_s).uniq
    self.section_statuses = section_statuses.is_a?(Hash) ? section_statuses : {}
    self.metadata = metadata.is_a?(Hash) ? metadata : {}
  end
end
