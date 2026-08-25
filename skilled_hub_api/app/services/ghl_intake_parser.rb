# frozen_string_literal: true

class GhlIntakeParser
  EMAIL_REGEX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i
  ZIP_REGEX = /\b\d{5}\b/

  def self.parse(email: nil, contact_info: nil)
    payload_email = extract_email(email.to_s)
    raw = contact_info.to_s
    parsed_email = extract_email(raw)
    zip_code = raw[ZIP_REGEX]

    {
      email: payload_email.presence || parsed_email,
      zip_code: zip_code
    }
  end

  def self.extract_email(text)
    match = text.to_s[EMAIL_REGEX]
    match&.strip&.downcase
  end
end
