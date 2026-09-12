# frozen_string_literal: true

module Ai
  class TurnRunner
    Result = Struct.new(:ok, :reply, :error, :http_status, :session, :duplicate, :ignored, keyword_init: true)

    def self.call(**attrs)
      new(**attrs).call
    end

    def initialize(session:, user:, inventory:, inbound:, persist: true, ghl_message_id: nil)
      @session = session
      @user = user
      @inventory = inventory
      @inbound = inbound.to_h
      @persist = persist
      @ghl_message_id = ghl_message_id
    end

    def call
      inventory_before = InventoryPresenter.sanitize(@inventory)
      media_error = @inbound[:attachment_error] || @inbound["attachment_error"]
      inbound_urls = Array(@inbound[:attachments] || @inbound["attachments"])

      agent = TechnicianVerificationAgent.call(
        inventory: @inventory,
        inbound: @inbound.merge(attachment_error: media_error),
        history: recent_history,
        pending_reference: @session.pending_reference,
        extra: extra_context
      )
      unless agent.ok
        log_turn(
          direction: @persist ? "inbound" : "system",
          inventory_before: inventory_before,
          error: agent.error
        )
        return Result.new(ok: false, error: agent.error, http_status: :unprocessable_entity, session: @session)
      end

      data = agent.data
      executed = ActionExecutor.call(
        user: @user,
        session: @session,
        inventory: @inventory,
        actions: data["actions"],
        inbound_urls: inbound_urls,
        persist: @persist
      )

      after_inventory = TechnicianVerificationInventory.call(@user.reload)
      status_update = next_status(executed, after_inventory)
      reply = outbound_reply(data["reply"], after_inventory, status_update)

      sent = nil
      if reply.present?
        sent = SessionMessenger.deliver(
          session: @session,
          user: @user,
          message: reply,
          context: "ai_technician_verification"
        )
        @session.reload
        if %w[opted_out failed].include?(@session.status)
          log_turn(
            direction: @persist ? "inbound" : "system",
            inventory_before: inventory_before,
            inventory_after: InventoryPresenter.sanitize(after_inventory),
            proposed: data["actions"],
            accepted: executed.accepted,
            rejected: executed.rejected,
            error: sent.error,
            body: @inbound[:body],
            attachments: inbound_urls,
            outbound_id: sent.provider_message_id,
            reply: reply
          )
          ok = @session.status == "opted_out"
          return Result.new(ok: ok, error: sent.error, http_status: sent.http_status, session: @session, reply: reply)
        end
      end

      unless %w[opted_out failed].include?(@session.status)
        @session.update!(status_update)
      end

      log_turn(
        direction: @persist ? "inbound" : "system",
        inventory_before: inventory_before,
        inventory_after: InventoryPresenter.sanitize(after_inventory),
        proposed: data["actions"],
        accepted: executed.accepted,
        rejected: executed.rejected,
        body: @inbound[:body],
        attachments: inbound_urls,
        outbound_id: sent&.provider_message_id,
        reply: reply
      )
      if sent&.provider_message_id
        @session.turns.create!(
          direction: "outbound",
          ghl_message_id: "out:#{sent.provider_message_id}",
          body: reply,
          metadata: { "provider_message_id" => sent.provider_message_id }
        )
      elsif reply.present?
        @session.turns.create!(direction: "outbound", body: reply)
      end

      Result.new(ok: true, reply: reply, session: @session.reload, http_status: :ok)
    end

    private

    def extra_context
      background = @inventory[:background_check] || {}
      {
        first_name: @user.first_name.to_s.strip.presence || "there",
        verification_url: "#{ENV.fetch("FRONTEND_URL", "http://localhost:5173").chomp("/")}/settings?tab=verification",
        invitation_url: background.dig(:details, :invitation_url) || background.dig("details", "invitation_url")
      }
    end

    def recent_history
      @session.turns.order(created_at: :desc, id: :desc).limit(8).reverse.map do |turn|
        { direction: turn.direction, body: turn.body.to_s.truncate(400) }
      end
    end

    def next_status(executed, inventory)
      if executed.needs_human || inventory[:needs_human]
        return { status: "needs_human", paused_at: Time.current, failure_reason: "Needs human review" }
      end
      if inventory[:collection_complete] || (executed.complete_requested && !inventory[:technician_actionable])
        return { status: "completed", completed_at: Time.current }
      end

      { status: "waiting_for_reply" }
    end

    def outbound_reply(ai_reply, inventory, status_update)
      text = ai_reply.to_s.strip
      if status_update[:status] == "completed" && text.blank?
        return "Thanks — I have everything I need from you right now. If your background check is still processing, there's nothing else you need to send."
      end
      return text if text.present?

      inventory.dig(:suggested_sms, :next_gap).presence ||
        "Thanks — what I still need is in the last note. Send that when you can."
    end

    def log_turn(direction:, inventory_before:, inventory_after: nil, proposed: [], accepted: [], rejected: [], error: nil, body: nil, attachments: [], outbound_id: nil, reply: nil)
      Rails.logger.info(
        "[ai_sms] session=#{@session.id} user=#{@user.id} ghl_message_id=#{@ghl_message_id} " \
        "actions_proposed=#{Array(proposed).map { |a| a.to_h["type"] || a.to_h[:type] }.inspect} " \
        "accepted=#{Array(accepted).map { |a| a["type"] }.inspect} rejected=#{Array(rejected).map { |a| a["type"] }.inspect} " \
        "outbound=#{outbound_id} error=#{error}"
      )
      attrs = {
        direction: direction,
        body: body.to_s.truncate(1600),
        attachments: Array(attachments),
        inventory_before: inventory_before,
        inventory_after: inventory_after,
        actions_proposed: Array(proposed),
        actions_accepted: Array(accepted),
        actions_rejected: Array(rejected),
        error: error,
        metadata: { "reply" => reply, "outbound_message_id" => outbound_id }.compact
      }
      if @ghl_message_id.present?
        turn = @session.turns.find_or_initialize_by(ghl_message_id: @ghl_message_id)
        turn.assign_attributes(attrs)
        turn.save!
      else
        @session.turns.create!(attrs)
      end
    rescue ActiveRecord::RecordNotUnique
      nil
    end
  end
end
