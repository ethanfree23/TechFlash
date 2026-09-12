# frozen_string_literal: true

module Ai
  class SessionMessenger
    Result = Struct.new(:ok, :status, :error, :provider_message_id, :conversation_id, :http_status, keyword_init: true)

    def self.deliver(session:, user:, message:, context:)
      new(session: session, user: user, message: message, context: context).deliver
    end

    def initialize(session:, user:, message:, context:)
      @session = session
      @user = user
      @message = message.to_s.strip
      @context = context
    end

    def deliver
      if @message.blank?
        return Result.new(ok: false, status: :failed, error: "Reply was empty", http_status: :unprocessable_entity)
      end

      outcome = Ghl::SmsSender.call(user: @user, message: @message, context: @context)
      attrs = {
        last_outbound_at: Time.current,
        ghl_contact_id: @user.reload.ghl_contact_id.presence || @session.ghl_contact_id
      }
      attrs[:ghl_conversation_id] = outcome.conversation_id if outcome.conversation_id.present?
      if outcome.status.to_s == "skipped_opt_out"
        attrs[:status] = "opted_out"
        attrs[:failure_reason] = outcome.error
        attrs[:completed_at] = Time.current
      elsif !outcome.ok && outcome.status.to_s != "skipped"
        attrs[:status] = "failed"
        attrs[:failure_reason] = outcome.error
      end
      @session.update!(attrs)

      if outcome.conversation_id.present? && @user.ghl_conversation_id.blank?
        @user.update_column(:ghl_conversation_id, outcome.conversation_id)
      end

      Result.new(
        ok: outcome.ok,
        status: outcome.status,
        error: outcome.error,
        provider_message_id: outcome.provider_message_id,
        conversation_id: outcome.conversation_id,
        http_status: outcome.http_status
      )
    end
  end
end
