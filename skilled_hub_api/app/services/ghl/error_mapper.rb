# frozen_string_literal: true

module Ghl
  class ErrorMapper
    def self.call(response)
      code = response.status_code.to_i
      text = [response.error, response.body.is_a?(Hash) ? response.body.values_at("message", "error", "raw") : nil].flatten.compact.join(" ")

      if dnd_or_opt_out?(text, code)
        return [:skipped_opt_out, :unprocessable_entity]
      end
      if invalid_phone?(text, code)
        return [:invalid_phone, :unprocessable_entity]
      end
      if code == 401 || code == 403
        return [:failed, :bad_gateway]
      end
      if response.retryable || [429, 500, 502, 503, 504].include?(code)
        return [:temporary_failure, :service_unavailable]
      end

      [:failed, :unprocessable_entity]
    end

    def self.dnd_or_opt_out?(text, code)
      down = text.to_s.downcase
      return true if down.match?(/\bdnd\b|do not disturb|opted.?out|unsubscribed|stop/)
      return true if text.to_s.match?(/\b(30004|21610)\b/)
      return true if code == 400 && down.include?("sms") && down.include?("dnd")

      false
    end

    def self.invalid_phone?(text, _code)
      down = text.to_s.downcase
      down.match?(/invalid phone|not a valid.*phone|landline|inactive number|undeliverable/)
    end
  end
end
