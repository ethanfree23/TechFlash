# frozen_string_literal: true

class AiSmsSession < ApplicationRecord
  PURPOSES = %w[technician_verification].freeze
  STATUSES = %w[active waiting_for_reply paused completed needs_human opted_out failed].freeze
  LIVE_STATUSES = %w[active waiting_for_reply].freeze

  belongs_to :user
  has_many :turns, class_name: "AiSmsTurn", dependent: :destroy

  validates :purpose, presence: true, inclusion: { in: PURPOSES }
  validates :status, presence: true, inclusion: { in: STATUSES }

  scope :live, -> { where(status: LIVE_STATUSES) }
  scope :technician_verification, -> { where(purpose: "technician_verification") }

  def self.live_for(user)
    live.technician_verification.where(user_id: user.id).order(created_at: :desc, id: :desc).first
  end

  def self.current_for(user)
    technician_verification.where(user_id: user.id).order(created_at: :desc, id: :desc).first
  end

  def live?
    LIVE_STATUSES.include?(status)
  end

  def conversation_url
    location = ghl_location_id
    return nil if ghl_conversation_id.blank? || location.blank?

    "https://app.gohighlevel.com/v2/location/#{CGI.escape(location)}/conversations/detail/#{CGI.escape(ghl_conversation_id)}"
  end

  def ghl_location_id
    metadata.to_h.stringify_keys["ghl_location_id"].presence || user&.ghl_location_id.presence || GhlConfiguration.location_id
  end

  def pending_reference
    raw = metadata.to_h.stringify_keys["pending_reference"]
    raw.is_a?(Hash) ? raw.stringify_keys : {}
  end

  def write_pending_reference!(attrs)
    meta = metadata.to_h.stringify_keys
    cleaned = attrs.to_h.stringify_keys.reject { |_k, v| v.blank? }
    if cleaned.blank?
      meta.delete("pending_reference")
    else
      meta["pending_reference"] = cleaned
    end
    update!(metadata: meta)
  end

  def as_admin_json
    {
      id: id,
      purpose: purpose,
      status: status,
      live: live?,
      started_at: started_at&.iso8601,
      last_inbound_at: last_inbound_at&.iso8601,
      last_outbound_at: last_outbound_at&.iso8601,
      completed_at: completed_at&.iso8601,
      paused_at: paused_at&.iso8601,
      failure_reason: failure_reason,
      ghl_contact_id: ghl_contact_id,
      ghl_conversation_id: ghl_conversation_id,
      conversation_url: conversation_url
    }.compact
  end
end
