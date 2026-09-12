# frozen_string_literal: true

module Ai
  class InboundSmsProcessor
    Result = Struct.new(:ok, :ignored, :duplicate, :body, :http_status, keyword_init: true)

    def self.call(payload)
      new(payload).call
    end

    def initialize(payload)
      @payload = payload
    end

    def call
      parsed = GhlInboundPayload.parse(@payload)
      return ignored("missing_contact") if parsed.contact_id.blank?
      return ignored("outbound_message") if parsed.direction == "outbound"
      channel = parsed.channel.to_s.downcase
      if channel.present? && !channel.include?("sms") && !channel.include?("mms")
        return ignored("non_sms")
      end

      message_id = parsed.message_id.presence || Digest::SHA256.hexdigest(
        [parsed.contact_id, parsed.conversation_id, parsed.body, parsed.timestamp].join(":")
      )[0, 40]

      event = find_or_create_event!(message_id, parsed)
      if event.processed_at.present?
        return Result.new(ok: true, duplicate: true, ignored: true, http_status: :ok, body: { success: true, duplicate: true })
      end

      user = User.find_by(ghl_contact_id: parsed.contact_id.to_s.strip)
      unless user
        mark_event!(event, error: "unknown_contact")
        return ignored("unknown_contact")
      end

      session = AiSmsSession.live_for(user)
      unless session
        mark_event!(event, user: user, error: "no_active_session")
        return ignored("no_active_session")
      end

      if session.ghl_conversation_id.blank? && parsed.conversation_id.present?
        session.update!(ghl_conversation_id: parsed.conversation_id)
      end

      if parsed.dnd || GhlInboundPayload.opt_out_text?(parsed.body)
        session.update!(
          status: "opted_out",
          failure_reason: "Technician opted out of SMS",
          last_inbound_at: Time.current,
          completed_at: Time.current
        )
        session.turns.create!(
          direction: "inbound",
          ghl_message_id: message_id,
          body: parsed.body.to_s.truncate(1600),
          metadata: { "opt_out" => true }
        )
        mark_event!(event, user: user)
        return Result.new(ok: true, http_status: :ok, body: { success: true, status: "opted_out" })
      end

      if AiSmsTurn.exists?(ghl_message_id: message_id)
        mark_event!(event, user: user)
        return Result.new(ok: true, duplicate: true, ignored: true, http_status: :ok, body: { success: true, duplicate: true })
      end

      begin
        session.turns.create!(
          direction: "inbound",
          ghl_message_id: message_id,
          body: parsed.body.to_s.truncate(1600),
          attachments: parsed.attachments
        )
      rescue ActiveRecord::RecordNotUnique
        mark_event!(event, user: user)
        return Result.new(ok: true, duplicate: true, ignored: true, http_status: :ok, body: { success: true, duplicate: true })
      end

      inventory = TechnicianVerificationInventory.call(user)
      media = InboundMediaHandler.call(user: user, inventory: inventory, urls: parsed.attachments)
      inventory = TechnicianVerificationInventory.call(user.reload) if media.saved

      session.update!(last_inbound_at: Time.current, ghl_contact_id: parsed.contact_id)
      turn = TurnRunner.call(
        session: session,
        user: user,
        inventory: inventory,
        inbound: {
          kind: "inbound_reply",
          body: parsed.body,
          attachments: parsed.attachments,
          attachment_error: media.ok ? nil : media.error
        },
        persist: true,
        ghl_message_id: message_id
      )
      mark_event!(event, user: user, error: turn.ok ? nil : turn.error)
      Result.new(
        ok: turn.ok,
        http_status: turn.ok ? :ok : (turn.http_status || :unprocessable_entity),
        body: { success: turn.ok, status: session.reload.status, error: turn.error }.compact
      )
    rescue ActiveRecord::RecordNotUnique
      Result.new(ok: true, duplicate: true, ignored: true, http_status: :ok, body: { success: true, duplicate: true })
    end

    private

    def ignored(reason)
      Result.new(ok: true, ignored: true, http_status: :ok, body: { success: true, ignored: true, reason: reason })
    end

    def find_or_create_event!(message_id, parsed)
      GhlWebhookEvent.find_or_create_by!(idempotency_key: "inbound-sms:#{message_id}") do |event|
        event.ghl_contact_id = parsed.contact_id
        event.event_type = "inbound_sms"
        event.payload = {
          "contact_id" => parsed.contact_id,
          "conversation_id" => parsed.conversation_id,
          "message_id" => message_id,
          "direction" => parsed.direction,
          "channel" => parsed.channel,
          "timestamp" => parsed.timestamp,
          "has_body" => parsed.body.present?,
          "attachment_count" => parsed.attachments.size
        }
        event.attempt_count = 0
      end
    end

    def mark_event!(event, user: nil, error: nil)
      event.update!(
        user_id: user&.id || event.user_id,
        processed_at: Time.current,
        processing_error: error,
        attempt_count: event.attempt_count.to_i + 1
      )
    rescue StandardError => e
      Rails.logger.warn("[ai_sms] failed to mark inbound event: #{e.class}: #{e.message}")
    end
  end
end
