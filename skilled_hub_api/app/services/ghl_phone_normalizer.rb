# frozen_string_literal: true

class GhlPhoneNormalizer
  def self.normalize(value)
    digits = value.to_s.gsub(/\D/, "")
    digits = digits[1..] if digits.length == 11 && digits.start_with?("1")
    digits.presence
  end

  # Digit strings that should match a stored US number regardless of formatting.
  # "+18325551212" and "8325551212" both need to hit E.164 or 10-digit values.
  def self.search_digit_variants(value)
    digits = value.to_s.gsub(/\D/, "")
    return [] if digits.blank?

    variants = [digits]
    variants << digits[1..] if digits.length >= 11 && digits.start_with?("1")
    variants << "1#{digits}" if digits.length == 10
    variants.map(&:presence).compact.uniq
  end
end
