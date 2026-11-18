# frozen_string_literal: true

class TechnicianActivation < ApplicationRecord
  STATUSES = %w[
    new
    contacting
    engaged
    onboarding
    ready
    available
    placed
    nurture
    unresponsive
    disqualified
  ].freeze

  AVAILABILITIES = %w[
    unknown
    available_now
    available_soon
    not_available
    has_a_job
  ].freeze

  # Soft guidance for admins. All transitions among STATUSES are allowed;
  # job eligibility is never derived from these values.
  SUGGESTED_TRANSITIONS = {
    "new" => %w[contacting nurture disqualified],
    "contacting" => %w[engaged unresponsive nurture disqualified],
    "engaged" => %w[onboarding nurture unresponsive contacting],
    "onboarding" => %w[ready nurture unresponsive engaged],
    "ready" => %w[available nurture onboarding],
    "available" => %w[placed nurture ready],
    "placed" => %w[available nurture],
    "nurture" => %w[contacting engaged onboarding],
    "unresponsive" => %w[contacting nurture disqualified],
    "disqualified" => %w[nurture contacting]
  }.freeze

  belongs_to :user
  belongs_to :status_updated_by, class_name: "User", optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :current_availability, inclusion: { in: AVAILABILITIES }
  validate :user_must_be_technician

  before_validation :normalize_fields

  def self.ensure_for!(user)
    raise ArgumentError, "technician required" unless user&.technician?

    find_or_create_by!(user_id: user.id) do |record|
      record.status = "new"
      record.current_availability = "unknown"
      record.status_updated_at = Time.current
    end
  end

  def apply_status!(new_status, admin:)
    normalized = new_status.to_s.strip
    raise ArgumentError, "invalid status" unless STATUSES.include?(normalized)

    previous = status
    return self if previous == normalized

    update!(
      status: normalized,
      status_updated_at: Time.current,
      status_updated_by: admin
    )
    previous
  end

  def refresh_follow_up_cache!
    next_due = TechnicianFollowUp.open_for(user_id).minimum(:due_at)
    update_columns(next_follow_up_at: next_due, updated_at: Time.current)
  end

  def record_contact!(interaction:)
    attrs = {
      last_contacted_at: interaction.occurred_at || Time.current,
      last_interaction_type: interaction.interaction_type,
      updated_at: Time.current
    }
    if interaction.interaction_type == "call" || interaction.outcome.present?
      attrs[:last_call_outcome] = interaction.outcome if interaction.outcome.present?
    end
    update_columns(attrs)
  end

  private

  def normalize_fields
    self.status = status.to_s.strip.presence || "new"
    self.current_availability = current_availability.to_s.strip.presence || "unknown"
  end

  def user_must_be_technician
    return if user&.technician?

    errors.add(:user, "must be a technician")
  end
end
