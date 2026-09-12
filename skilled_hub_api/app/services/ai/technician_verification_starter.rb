# frozen_string_literal: true

module Ai
  class TechnicianVerificationStarter
    PURPOSE = "technician_verification"

    Result = Struct.new(
      :ok,
      :status,
      :error,
      :http_status,
      :session,
      :inventory,
      :resumed,
      :outbound_message,
      keyword_init: true
    )

    def self.call(user:, actor: nil)
      new(user: user, actor: actor).call
    end

    def initialize(user:, actor: nil)
      @user = user
      @actor = actor
    end

    def call
      return fail_result("User not found", :not_found) if @user.blank?
      return fail_result("AI SMS is only available for technicians", :unprocessable_entity) unless @user.technician?
      return fail_result("Technician profile is missing", :unprocessable_entity) if @user.technician_profile.blank?
      return fail_result("AI provider is not configured", :service_unavailable) unless Client.configured?

      if SmsDeliveryLog.latest_ghl_opt_out_for(@user.id)
        return fail_result("This technician opted out of GHL SMS. DND was not changed.", :unprocessable_entity)
      end

      inventory = TechnicianVerificationInventory.call(@user)
      return fail_result("Verification inventory is unavailable", :unprocessable_entity) if inventory.blank?

      if inventory[:needs_human] && !inventory[:technician_actionable]
        return Result.new(
          ok: false,
          status: "needs_human",
          error: "Background check needs human review. AI collection was not started.",
          http_status: :unprocessable_entity,
          inventory: inventory
        )
      end

      unless inventory[:technician_actionable]
        return Result.new(
          ok: false,
          status: "collection_complete",
          error: "Verification collection is already complete for this technician.",
          http_status: :unprocessable_entity,
          inventory: inventory
        )
      end

      existing = AiSmsSession.live_for(@user)
      if existing
        return Result.new(
          ok: true,
          status: existing.status,
          http_status: :ok,
          session: existing,
          inventory: inventory,
          resumed: true
        )
      end

      session = resume_or_create!(inventory)
      turn = TurnRunner.new(
        session: session,
        user: @user,
        inventory: inventory,
        inbound: { kind: "session_start", body: "", attachments: [] },
        persist: false
      ).call

      unless turn.ok
        session.update!(status: "failed", failure_reason: turn.error) unless session.reload.status == "opted_out"
        return fail_result(turn.error, turn.http_status || :unprocessable_entity, inventory: inventory, session: session)
      end

      session.reload
      if session.status == "opted_out"
        return fail_result("This technician opted out of GHL SMS. DND was not changed.", :unprocessable_entity, inventory: inventory, session: session)
      end

      Result.new(
        ok: true,
        status: session.reload.status,
        http_status: :ok,
        session: session,
        inventory: TechnicianVerificationInventory.call(@user.reload),
        outbound_message: turn.reply,
        resumed: false
      )
    rescue ActiveRecord::RecordNotUnique
      existing = AiSmsSession.live_for(@user)
      Result.new(ok: true, status: existing&.status, http_status: :ok, session: existing, inventory: inventory, resumed: true)
    end

    private

    def resume_or_create!(inventory)
      paused = AiSmsSession.technician_verification.where(user_id: @user.id, status: %w[paused needs_human]).order(created_at: :desc).first
      if paused
        paused.update!(
          status: "active",
          started_at: paused.started_at || Time.current,
          paused_at: nil,
          failure_reason: nil,
          metadata: paused.metadata.to_h.merge(
            "ghl_location_id" => @user.ghl_location_id.presence || GhlConfiguration.location_id,
            "actor_user_id" => @actor&.id,
            "inventory_at_start" => InventoryPresenter.sanitize(inventory)
          )
        )
        return paused
      end

      AiSmsSession.create!(
        user: @user,
        ghl_contact_id: @user.ghl_contact_id,
        ghl_conversation_id: @user.ghl_conversation_id,
        purpose: PURPOSE,
        status: "active",
        started_at: Time.current,
        metadata: {
          "ghl_location_id" => @user.ghl_location_id.presence || GhlConfiguration.location_id,
          "actor_user_id" => @actor&.id,
          "inventory_at_start" => InventoryPresenter.sanitize(inventory)
        }
      )
    end

    def fail_result(error, http_status, inventory: nil, session: nil)
      Result.new(ok: false, error: error, http_status: http_status, inventory: inventory, session: session)
    end
  end
end
