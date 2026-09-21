# frozen_string_literal: true

# Resolves which existing TechFlash user (if any) a GHL contact refers to, by GHL contact id,
# email, and normalized phone, and refuses ambiguous or cross-role matches.
#
# Same lookup and conflict rules as GhlTechnicianMatcher, parameterised by role. The technician
# path still uses GhlTechnicianMatcher unchanged; it can be collapsed onto this class once
# its suite has been re-run against it.
class GhlAccountMatcher
  Result = Struct.new(:user, :conflict, :error, :matched_by, keyword_init: true) do
    def conflict?
      conflict == true
    end
  end

  def self.call(role:, ghl_contact_id:, email:, phone_normalized:)
    new(role: role, ghl_contact_id: ghl_contact_id, email: email, phone_normalized: phone_normalized).call
  end

  def initialize(role:, ghl_contact_id:, email:, phone_normalized:)
    @role = role.to_s
    @ghl_contact_id = ghl_contact_id.to_s.strip.presence
    @email = email.to_s.strip.downcase.presence
    @phone_normalized = phone_normalized.to_s.strip.presence
  end

  def call
    contact_user = @ghl_contact_id.present? ? User.find_by(ghl_contact_id: @ghl_contact_id) : nil
    email_user = @email.present? ? User.where("LOWER(email) = ?", @email).first : nil
    phone_user = @phone_normalized.present? ? User.find_by(phone_normalized: @phone_normalized) : nil

    candidates = [contact_user, email_user, phone_user].compact
    wrong_role = candidates.find { |user| user.role.to_s != @role }
    if wrong_role
      return conflict("A #{wrong_role.role} account already exists for this email or phone")
    end

    distinct = candidates.uniq
    return conflict("Email and phone match different TechFlash accounts") if distinct.size > 1

    user = distinct.first
    return Result.new(user: nil, conflict: false) if user.nil?

    # A phone number alone is weak identity for businesses (shared office lines). If only the
    # phone matched and the payload carries a different email, don't fold a new person into
    # someone else's login.
    if contact_user.nil? && email_user.nil? && @email.present? && user.email.to_s.downcase != @email
      return conflict("Phone matches an existing TechFlash account with a different email")
    end

    Result.new(user: user, conflict: false, matched_by: matched_by(user, contact_user, email_user))
  end

  private

  def matched_by(user, contact_user, email_user)
    return "ghl_contact_id" if contact_user == user
    return "email" if email_user == user

    "phone"
  end

  def conflict(message)
    Result.new(user: nil, conflict: true, error: message)
  end
end
