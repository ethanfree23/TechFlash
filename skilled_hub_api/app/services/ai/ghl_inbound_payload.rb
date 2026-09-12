# frozen_string_literal: true

module Ai
  class GhlInboundPayload
    OPT_OUT_PHRASES = %w[stop stopall unsubscribe cancel end quit].freeze

    Parsed = Struct.new(
      :contact_id,
      :conversation_id,
      :message_id,
      :body,
      :attachments,
      :timestamp,
      :direction,
      :channel,
      :dnd,
      :raw,
      keyword_init: true
    )

    def self.parse(raw)
      new(raw).parse
    end

    def initialize(raw)
      @data = stringify(raw)
    end

    def parse
      body = first_present(%w[body message message_body text inbound_message])
      body = nested("message", "body") if body.blank?
      direction = normalize_direction(
        first_present(%w[direction message_direction type event]) || nested("message", "direction")
      )
      Parsed.new(
        contact_id: contact_id,
        conversation_id: first_present(%w[ghl_conversation_id conversationId conversation_id]) || nested("conversation", "id") || nested("message", "conversationId"),
        message_id: first_present(%w[ghl_message_id messageId message_id idempotency_key]) || nested("message", "id"),
        body: body.to_s,
        attachments: attachment_urls,
        timestamp: first_present(%w[timestamp dateAdded date_added]) || nested("message", "dateAdded"),
        direction: direction,
        channel: first_present(%w[channel messageType message_type]) || nested("message", "messageType") || "SMS",
        dnd: dnd?,
        raw: @data
      )
    end

    def self.opt_out_text?(text)
      token = text.to_s.strip.downcase
      return false if token.blank?

      OPT_OUT_PHRASES.include?(token) || (token.split(/\s+/) & OPT_OUT_PHRASES).any?
    end

    private

    def contact_id
      first_present(%w[ghl_contact_id contactId contact_id]) ||
        nested("contact", "id") ||
        nested("message", "contactId")
    end

    def attachment_urls
      values = [
        @data["attachments"],
        @data["message_attachments"],
        @data["media_url"],
        @data["mediaUrl"],
        nested("message", "attachments"),
        nested("customData", "attachments"),
        nested("custom_data", "attachments")
      ]
      values.flat_map { |value| extract_urls(value) }.uniq
    end

    def extract_urls(value)
      case value
      when nil
        []
      when Hash
        extract_urls(value["url"] || value["media_url"] || value["mediaUrl"] || value.values)
      when Array
        value.flat_map { |item| extract_urls(item) }
      when String
        value.to_s.scan(%r{https?://[^\s"'<>\\]+}i).map { |url| url.sub(/[),.;]+$/, "") }
      else
        []
      end
    end

    def dnd?
      flag = first_present(%w[dnd opted_out optedOut])
      return true if ActiveModel::Type::Boolean.new.cast(flag)
      return true if nested("contact", "dnd") == true || nested("contact", "dnd").to_s == "true"

      false
    end

    def normalize_direction(value)
      token = value.to_s.downcase
      return "outbound" if token.include?("outbound") || token == "outboundmessage"
      return "inbound" if token.include?("inbound") || token.include?("replied") || token == "inboundmessage"

      "inbound"
    end

    def first_present(keys)
      keys.each do |key|
        value = @data[key]
        return value if value.present?
      end
      nil
    end

    def nested(*keys)
      @data.dig(*keys)
    end

    def stringify(raw)
      hash =
        case raw
        when ActionController::Parameters
          raw.to_unsafe_h
        when Hash
          raw
        else
          {}
        end
      hash.deep_stringify_keys
    end
  end
end
