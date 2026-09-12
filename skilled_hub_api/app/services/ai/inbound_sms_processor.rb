# frozen_string_literal: true

module Ai
  class InboundSmsProcessor
    DEDUPE_WINDOW = 2.minutes

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

      user = User.find_by(ghl_contact_id: parsed.contact_id.to_s.strip)
      return ignored("unknown_contact") unless user

      session = AiSmsSession.live_for(user)
      return ignored("no_active_session") unless session

      fingerprint = InboundFingerprint.call(
        contact_id: parsed.contact_id,
        body: parsed.body,
        attachments: parsed.attachments
      )

      session.with_lock do
        process_locked(parsed, user, session, fingerprint)
      end
    rescue ActiveRecord::RecordNotUnique
      Result.new(ok: true, duplicate: true, ignored: true, http_status: :ok, body: { success: true, duplicate: true })
    end

    private

    def process_locked(parsed, user, session, fingerprint)
      if session.ghl_conversation_id.blank? && parsed.conversation_id.present?
        session.update!(ghl_conversation_id: parsed.conversation_id)
      end

      if parsed.message_id.present?
        event = GhlWebhookEvent.find_by(idempotency_key: "inbound-sms:#{parsed.message_id}")
        if event&.processed_at.present? || AiSmsTurn.exists?(ghl_message_id: parsed.message_id)
          mark_event!(event, user: user) if event
          return Result.new(ok: true, duplicate: true, ignored: true, http_status: :ok, body: { success: true, duplicate: true })
        end
      end

      if fingerprint_replay?(session, fingerprint)
        return Result.new(ok: true, duplicate: true, ignored: true, http_status: :ok, body: { success: true, duplicate: true })
      end

      event = create_event!(parsed, fingerprint)
      received_at = Time.current
      if parsed.dnd || GhlInboundPayload.opt_out_text?(parsed.body)
        session.update!(
          status: "opted_out",
          failure_reason: "Technician opted out of SMS",
          last_inbound_at: received_at,
          completed_at: received_at
        )
        session.turns.create!(
          direction: "inbound",
          ghl_message_id: parsed.message_id.presence,
          inbound_fingerprint: fingerprint,
          received_at: received_at,
          body: parsed.body.to_s.truncate(1600),
          attachments: parsed.attachments,
          metadata: { "opt_out" => true, "received_at" => received_at.iso8601 }
        )
        mark_event!(event, user: user)
        return Result.new(ok: true, http_status: :ok, body: { success: true, status: "opted_out" })
      end

      inbound_turn = session.turns.create!(
        direction: "inbound",
        ghl_message_id: parsed.message_id.presence,
        inbound_fingerprint: fingerprint,
        received_at: received_at,
        body: parsed.body.to_s.truncate(1600),
        attachments: parsed.attachments,
        metadata: { "received_at" => received_at.iso8601 }
      )

      inventory = TechnicianVerificationInventory.call(user)
      media = InboundMediaHandler.call(user: user, inventory: inventory, urls: parsed.attachments)
      inventory = TechnicianVerificationInventory.call(user.reload) if media.saved

      session.update!(last_inbound_at: received_at, ghl_contact_id: parsed.contact_id)
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
        ghl_message_id: parsed.message_id.presence,
        inbound_turn: inbound_turn
      )
      mark_event!(event, user: user, error: turn.ok ? nil : turn.error)
      Result.new(
        ok: turn.ok,
        http_status: turn.ok ? :ok : (turn.http_status || :unprocessable_entity),
        body: { success: turn.ok, status: session.reload.status, error: turn.error }.compact
      )
    end

    def fingerprint_replay?(session, fingerprint)
      return false if fingerprint.blank?

      session.turns
        .where(direction: "inbound", inbound_fingerprint: fingerprint)
        .where("received_at >= ?", DEDUPE_WINDOW.ago)
        .exists?
    end

    def ignored(reason)
      Result.new(ok: true, ignored: true, http_status: :ok, body: { success: true, ignored: true, reason: reason })
    end

    def create_event!(parsed, fingerprint)
      key =
        if parsed.message_id.present?
          "inbound-sms:#{parsed.message_id}"
        else
          "inbound-sms:#{SecureRandom.uuid}"
        end

      GhlWebhookEvent.create!(
        idempotency_key: key,
        ghl_contact_id: parsed.contact_id,
        event_type: "inbound_sms",
        payload: {
          "contact_id" => parsed.contact_id,
          "conversation_id" => parsed.conversation_id,
          "message_id" => parsed.message_id,
          "fingerprint" => fingerprint,
          "direction" => parsed.direction,
          "channel" => parsed.channel,
          "timestamp" => parsed.timestamp,
          "has_body" => parsed.body.present?,
          "attachment_count" => parsed.attachments.size
        },
        attempt_count: 0
      )
    rescue ActiveRecord::RecordNotUnique
      GhlWebhookEvent.find_by!(idempotency_key: key)
    end

    def mark_event!(event, user: nil, error: nil)
      return if event.blank?

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
