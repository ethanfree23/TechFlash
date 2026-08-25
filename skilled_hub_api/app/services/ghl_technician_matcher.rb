# frozen_string_literal: true

class GhlTechnicianMatcher
  Result = Struct.new(:user, :conflict, :error, keyword_init: true) do
    def conflict?
      conflict == true
    end
  end

  def self.call(ghl_contact_id:, email:, phone_normalized:)
    new(
      ghl_contact_id: ghl_contact_id,
      email: email,
      phone_normalized: phone_normalized
    ).call
  end

  def initialize(ghl_contact_id:, email:, phone_normalized:)
    @ghl_contact_id = ghl_contact_id.to_s.strip.presence
    @email = email.to_s.strip.downcase.presence
    @phone_normalized = phone_normalized.to_s.strip.presence
  end

  def call
    contact_user = @ghl_contact_id.present? ? User.find_by(ghl_contact_id: @ghl_contact_id) : nil
    email_user = @email.present? ? User.where("LOWER(email) = ?", @email).first : nil
    phone_user = @phone_normalized.present? ? User.find_by(phone_normalized: @phone_normalized) : nil

    candidates = [contact_user, email_user, phone_user].compact
    non_technician = candidates.find { |user| !user.technician? }
    if non_technician
      return Result.new(
        conflict: true,
        error: "A #{non_technician.role} account already exists for this email or phone"
      )
    end

    distinct = candidates.uniq
    if distinct.size > 1
      return Result.new(
        conflict: true,
        error: "Email and phone match different TechFlash accounts"
      )
    end

    Result.new(user: distinct.first, conflict: false)
  end
end
