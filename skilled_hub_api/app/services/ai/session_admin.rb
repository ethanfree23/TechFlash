# frozen_string_literal: true

module Ai
  class SessionAdmin
    Result = Struct.new(:ok, :error, :http_status, :session, :inventory, keyword_init: true)

    def self.payload_for(user)
      inventory = user&.technician? ? TechnicianVerificationInventory.call(user) : nil
      session = user ? AiSmsSession.current_for(user) : nil
      {
        inventory: inventory,
        session: session&.as_admin_json,
        technician_actionable: inventory && inventory[:technician_actionable],
        collection_complete: inventory && inventory[:collection_complete]
      }
    end

    def self.pause(session:)
      return Result.new(ok: false, error: "AI session not found", http_status: :not_found) if session.blank?
      return Result.new(ok: false, error: "AI session is not active", http_status: :unprocessable_entity) unless session.live?

      session.update!(status: "paused", paused_at: Time.current)
      Result.new(ok: true, http_status: :ok, session: session)
    end

    def self.end_session(session:)
      return Result.new(ok: false, error: "AI session not found", http_status: :not_found) if session.blank?
      unless session.live? || session.status == "paused" || session.status == "needs_human"
        return Result.new(ok: false, error: "AI session is already closed", http_status: :unprocessable_entity)
      end

      session.update!(
        status: "completed",
        completed_at: Time.current,
        paused_at: session.paused_at,
        metadata: session.metadata.to_h.merge("ended_by_admin" => true)
      )
      Result.new(ok: true, http_status: :ok, session: session)
    end
  end
end
