# frozen_string_literal: true

class GhlTechnicianProvisioner
  class Error < StandardError; end

  def self.upsert!(attrs)
    new(attrs).upsert!
  end

  def initialize(attrs)
    @existing_user = attrs[:user]
    @email = attrs[:email].to_s.strip.downcase
    @phone = attrs[:phone].to_s.strip
    @first_name = attrs[:first_name]
    @last_name = attrs[:last_name]
    @ghl_contact_id = attrs[:ghl_contact_id].to_s.strip
    @ghl_location_id = attrs[:ghl_location_id].to_s.strip
    @ghl_conversation_id = attrs[:ghl_conversation_id]
    @zip_code = attrs[:zip_code]
    @intake_contact_info = attrs[:tf_intake_contact_info]
    @intake_references = attrs[:tf_intake_references]
    @parsed_references = Array(attrs[:parsed_references])
  end

  def upsert!
    created = @existing_user.blank?
    user = @existing_user || User.new(role: :technician)
    assign_user_attributes!(user, created: created)
    profile = nil

    ActiveRecord::Base.transaction do
      user.save!
      profile = user.technician_profile || user.build_technician_profile
      assign_profile_attributes!(profile)
      profile.save!
      persist_references!(user)
    end

    { user: user.reload, profile: profile.reload, created: created }
  rescue ActiveRecord::RecordInvalid => e
    raise Error, e.record.errors.full_messages.to_sentence.presence || e.message
  end

  private

  def assign_user_attributes!(user, created:)
    if created
      password = SecureRandom.urlsafe_base64(32)
      user.password = password
      user.password_confirmation = password
      user.password_set_actor = "system"
      user.role = :technician
      user.ghl_onboarded_at = Time.current
    else
      user.ghl_onboarded_at ||= Time.current
    end

    assign_unless_blank(user, :email, @email)
    assign_unless_blank(user, :phone, @phone)
    assign_unless_blank(user, :first_name, @first_name)
    assign_unless_blank(user, :last_name, @last_name)
    assign_unless_blank(user, :ghl_contact_id, @ghl_contact_id)
    assign_unless_blank(user, :ghl_location_id, @ghl_location_id)
    assign_unless_blank(user, :ghl_conversation_id, @ghl_conversation_id)
    assign_unless_blank(user, :ghl_intake_contact_info, @intake_contact_info)
    assign_unless_blank(user, :ghl_intake_references, @intake_references)
    user.phone_normalized = GhlPhoneNormalizer.normalize(@phone.presence || user.phone)
  end

  def assign_profile_attributes!(profile)
    profile.background_verified = false if profile.new_record?
    assign_unless_blank(profile, :phone, @phone)
    assign_unless_blank(profile, :zip_code, @zip_code)
  end

  def persist_references!(user)
    @parsed_references.each do |ref|
      phone_normalized = GhlPhoneNormalizer.normalize(ref[:phone] || ref["phone"])
      next if phone_normalized.blank?

      full_name = (ref[:full_name] || ref["full_name"]).to_s.strip
      next if full_name.blank?

      existing = user.verification_references_as_technician.find_by(phone_normalized: phone_normalized)
      if existing
        assign_unless_blank(existing, :full_name, full_name)
        assign_unless_blank(existing, :company_name, ref[:company_name] || ref["company_name"])
        assign_unless_blank(existing, :relationship, ref[:relationship] || ref["relationship"])
        existing.save!
        next
      end

      user.verification_references_as_technician.create!(
        full_name: full_name,
        phone: (ref[:phone] || ref["phone"]).to_s.strip,
        company_name: (ref[:company_name] || ref["company_name"]).to_s.strip.presence,
        relationship: (ref[:relationship] || ref["relationship"]).to_s.strip.presence,
        email: nil,
        status: :requested,
        requested_at: Time.current
      )
    end
  end

  def assign_unless_blank(record, field, value)
    cleaned = value.is_a?(String) ? value.strip : value
    return if cleaned.blank?

    record.public_send("#{field}=", cleaned)
  end
end
