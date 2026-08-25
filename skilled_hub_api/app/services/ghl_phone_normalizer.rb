# frozen_string_literal: true

class GhlPhoneNormalizer
  def self.normalize(value)
    digits = value.to_s.gsub(/\D/, "")
    digits = digits[1..] if digits.length == 11 && digits.start_with?("1")
    digits.presence
  end
end
