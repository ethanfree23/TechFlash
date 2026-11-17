# frozen_string_literal: true

class TechnicianInteraction < ApplicationRecord
  INTERACTION_TYPES = %w[note call voicemail sms email follow_up status_change].freeze
  CALL_OUTCOMES = %w[
    connected
    left_voicemail
    no_answer
    requested_callback
    wrong_number
    not_interested
  ].freeze

  belongs_to :user
  belongs_to :author, class_name: "User"
  has_many :technician_follow_ups, dependent: :nullify

  validates :interaction_type, inclusion: { in: INTERACTION_TYPES }
  validates :outcome, inclusion: { in: CALL_OUTCOMES }, allow_nil: true
  validates :occurred_at, presence: true
  validates :client_key, uniqueness: { scope: :user_id }, allow_nil: true
  validate :user_must_be_technician
  validate :author_must_be_admin
  validate :body_or_structured_event_present
  validate :outcome_matches_type

  before_validation :normalize_fields

  scope :for_user, ->(user_id) { where(user_id: user_id) }
  scope :newest_first, -> { order(occurred_at: :desc, id: :desc) }

  def call_like?
    interaction_type.in?(%w[call voicemail]) || outcome.present?
  end

  private

  def normalize_fields
    self.interaction_type = interaction_type.to_s.strip.presence || "note"
    self.outcome = outcome.to_s.strip.presence
    self.client_key = client_key.to_s.strip.presence
    self.occurred_at ||= Time.current
    self.metadata = {} if metadata.nil?
    self.body = body.to_s.strip.presence
  end

  def user_must_be_technician
    return if user&.technician?

    errors.add(:user, "must be a technician")
  end

  def author_must_be_admin
    return if author&.admin?

    errors.add(:author, "must be an admin")
  end

  def body_or_structured_event_present
    return if body.present?
    return if interaction_type == "status_change"
    return if interaction_type.in?(%w[call voicemail]) && outcome.present?
    return if interaction_type == "follow_up" && follow_up_at.present?

    errors.add(:body, "can't be blank")
  end

  def outcome_matches_type
    return if outcome.blank?
    return if interaction_type.in?(%w[call voicemail note])

    errors.add(:outcome, "is only valid for calls, voicemails, or notes")
  end
end
