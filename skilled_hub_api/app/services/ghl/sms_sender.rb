# frozen_string_literal: true

module Ghl
  class SmsSender
    MAX_MESSAGE_LENGTH = 1600

    Result = Struct.new(
      :ok,
      :status,
      :error,
      :destination,
      :provider_message_id,
      :conversation_id,
      :http_status,
      :log_id,
      keyword_init: true
    ) do
      def as_json(_options = nil)
        {
          success: ok == true,
          status: status.to_s,
          error: error,
          destination: destination,
          provider_message_id: provider_message_id,
          conversation_id: conversation_id,
          log_id: log_id
        }.compact
      end
    end

    def self.call(user:, message:, context: nil, client: nil)
      new(user: user, message: message, context: context, client: client).call
    end

    def initialize(user:, message:, context:, client: nil)
      @user = user
      @message = message.to_s
      @context = context
      @client = client || ApiClient.new
    end

    def call
      validation = validate_request
      return persist_and_return(validation) if validation

      if defined?(DemoMode) && DemoMode.enabled?
        return persist_and_return(result(ok: true, status: :skipped, error: "Demo mode: SMS not sent", http_status: :ok))
      end

      unless GhlConfiguration.outbound_configured?
        return persist_and_return(result(ok: false, status: :failed, error: "GHL SMS is not configured", http_status: :service_unavailable))
      end

      opt_out = known_opt_out_log
      if opt_out
        return persist_and_return(
          result(
            ok: false,
            status: :skipped_opt_out,
            error: "Previous GHL SMS was blocked by STOP/DND. Not retrying a permanent opt-out.",
            http_status: :unprocessable_entity
          )
        )
      end

      destination = GhlPhoneNormalizer.e164(destination_phone)
      if destination.blank?
        return persist_and_return(result(ok: false, status: :invalid_phone, error: "A valid US mobile number is required", http_status: :unprocessable_entity))
      end

      resolved = ContactResolver.call(user: @user, client: @client)
      unless resolved.ok
        return persist_and_return(
          result(
            ok: false,
            status: resolved.status || :failed,
            error: resolved.error,
            http_status: resolved.http_status || :unprocessable_entity
          )
        )
      end

      if sms_dnd?(resolved.contact)
        return persist_and_return(
          result(
            ok: false,
            status: :skipped_opt_out,
            error: "GHL SMS DND is enabled for this contact. DND was not changed.",
            http_status: :unprocessable_entity,
            destination: destination
          )
        )
      end

      sent = @client.send_sms(contact_id: resolved.contact_id, message: @message.strip)
      unless sent.ok
        status, http_status = ErrorMapper.call(sent)
        return persist_and_return(
          result(
            ok: false,
            status: status,
            error: sent.error,
            http_status: http_status,
            destination: destination
          )
        )
      end

      body = sent.body.is_a?(Hash) ? sent.body.stringify_keys : {}
      persist_and_return(
        result(
          ok: true,
          status: :sent,
          http_status: :ok,
          destination: destination,
          provider_message_id: body["messageId"].presence || body["message_id"].presence,
          conversation_id: body["conversationId"].presence || body["conversation_id"].presence
        )
      )
    end

    private

    def validate_request
      return result(ok: false, status: :failed, error: "User is required", http_status: :unprocessable_entity) if @user.blank?
      return result(ok: false, status: :failed, error: "Message is required", http_status: :unprocessable_entity) if @message.strip.blank?
      if @message.length > MAX_MESSAGE_LENGTH
        return result(ok: false, status: :failed, error: "Message must be #{MAX_MESSAGE_LENGTH} characters or fewer", http_status: :unprocessable_entity)
      end

      nil
    end

    def destination_phone
      @user.phone.presence || @user.technician_profile&.phone.presence || @user.company_profile&.phone
    end

    def category
      raw = @context
      raw = raw[:category] || raw["category"] if raw.is_a?(Hash)
      value = raw.to_s.strip.presence || "admin_manual"
      value.truncate(80)
    end

    def known_opt_out_log
      SmsDeliveryLog.where(user_id: @user.id, provider: "ghl", status: "skipped_opt_out").order(created_at: :desc, id: :desc).first
    end

    def sms_dnd?(contact)
      return false unless contact.is_a?(Hash)

      data = contact.stringify_keys
      return true if ActiveModel::Type::Boolean.new.cast(data["dnd"])

      settings = data["dndSettings"] || data["dnd_settings"] || {}
      settings = settings.stringify_keys if settings.respond_to?(:stringify_keys)
      sms = settings["SMS"] || settings["sms"] || {}
      sms = sms.stringify_keys if sms.respond_to?(:stringify_keys)
      status = sms["status"].to_s.downcase
      code = sms["code"].to_s.upcase
      status == "active" || code == "OPTED_OUT"
    end

    def persist_and_return(outcome)
      log = SmsDeliveryLog.create!(
        user_id: @user.id,
        category: category,
        destination: outcome.destination.presence || destination_phone.to_s.presence || "unknown",
        message: @message.to_s.truncate(1600),
        status: outcome.status.to_s,
        error_message: outcome.error,
        provider: "ghl",
        provider_message_id: outcome.provider_message_id,
        provider_conversation_id: outcome.conversation_id
      )
      outcome.log_id = log.id
      outcome
    rescue StandardError => e
      Rails.logger.warn("[ghl sms] failed to persist delivery log: #{e.class}: #{e.message}")
      outcome
    end

    def result(**attrs)
      Result.new(**attrs)
    end
  end
end
