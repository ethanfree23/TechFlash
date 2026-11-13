# frozen_string_literal: true

# Durable TechFlash platform acknowledgements for background verification.
# These are NOT substitutes for Checkr-hosted FCRA disclosures / authorizations;
# Checkr's Apply Flow collects those. Rows persist across refresh/logout/devices.
class BackgroundCheckAcknowledgement < ApplicationRecord
  PLATFORM_NOTICE = "platform_notice"
  SCREENING_PROCESS = "screening_process"
  TYPES = [PLATFORM_NOTICE, SCREENING_PROCESS].freeze

  # Bump when acknowledgement copy changes in a material way.
  DOCUMENT_VERSIONS = {
    PLATFORM_NOTICE => "techflash_bg_platform_notice_v1",
    SCREENING_PROCESS => "techflash_bg_screening_process_v1"
  }.freeze

  COPY = {
    PLATFORM_NOTICE =>
      "I understand TechFlash uses Checkr for background verification, and that Checkr will collect " \
      "required legal authorizations, disclosures, and identity information in its secure Apply Flow.",
    SCREENING_PROCESS =>
      "I confirm my TechFlash profile information is accurate and I am ready to complete Checkr's " \
      "hosted background-check application when I start the process."
  }.freeze

  belongs_to :user
  belongs_to :actor_user, class_name: "User"

  validates :acknowledgement_type, inclusion: { in: TYPES }
  validates :document_version, presence: true
  validates :acknowledgement_type, uniqueness: { scope: :user_id }
  validate :accepted_requires_timestamp

  scope :accepted_now, -> { where(accepted: true) }

  def self.current_version_for(type)
    DOCUMENT_VERSIONS.fetch(type.to_s)
  end

  def self.copy_for(type)
    COPY.fetch(type.to_s)
  end

  def self.required_accepted?(user)
    TYPES.all? do |type|
      row = find_by(user_id: user.id, acknowledgement_type: type)
      row&.accepted? && row.document_version == current_version_for(type)
    end
  end

  def self.payload_for(user)
    TYPES.map do |type|
      row = find_by(user_id: user.id, acknowledgement_type: type)
      {
        acknowledgement_type: type,
        document_version: current_version_for(type),
        copy: copy_for(type),
        accepted: row&.accepted? == true && row.document_version == current_version_for(type),
        accepted_at: (row&.accepted? && row.document_version == current_version_for(type)) ? row.accepted_at : nil
      }
    end
  end

  private

  def accepted_requires_timestamp
    return unless accepted?
    return if accepted_at.present?

    errors.add(:accepted_at, "must be present when accepted")
  end
end
