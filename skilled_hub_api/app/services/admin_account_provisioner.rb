# frozen_string_literal: true

# Creates technician or company users from the admin panel with email-derived temp password
# and sends the standard password-reset email.
module AdminAccountProvisioner
  class Error < StandardError; end

  module_function

  # rubocop:disable Metrics/ParameterLists
  def provision_company!(
    email:, company_name: nil, industry: nil, bio: nil,
    phone: nil, website_url: nil, facebook_url: nil, instagram_url: nil, linkedin_url: nil,
    service_cities: nil,
    logo: nil,
    contact_name: nil
  )
    # rubocop:enable Metrics/ParameterLists
    email = normalize_email(email)
    assert_email_available!(email)

    company_name_clean = company_name.to_s.strip
    phone_clean = phone.to_s.strip
    bio_clean = bio.to_s.strip
    raise Error, "Company name is required" if company_name_clean.blank?
    raise Error, "Phone number is required" if phone_clean.blank?
    raise Error, "Bio is required" if bio_clean.blank?

    cities = normalize_cities(service_cities)
    pw = User.initial_password_from_email(email)
    user = nil
    profile = nil

    ActiveRecord::Base.transaction do
      user = User.create!(
        email: email,
        password: pw,
        password_confirmation: pw,
        role: :company
      )
      profile = CompanyProfile.create!(
        user: user,
        company_name: company_name_clean,
        industry: industry.to_s.strip.presence,
        bio: bio_clean,
        phone: phone_clean,
        website_url: strip_or_nil(website_url),
        facebook_url: strip_or_nil(facebook_url),
        instagram_url: strip_or_nil(instagram_url),
        linkedin_url: strip_or_nil(linkedin_url),
        service_cities: cities
      )
      user.update_column(:company_profile_id, profile.id)
      profile.avatar.attach(logo) if logo.respond_to?(:tempfile)

      user.generate_password_reset_token!
      create_crm_prospect_for_company!(user: user, profile: profile, contact_name: contact_name)
    end

    send_reset_email(user)
    { user: user, profile: profile.reload }
  end

  def provision_technician!(email:, trade_type: nil, location: nil, experience_years: nil, availability: nil, bio: nil)
    email = normalize_email(email)
    assert_email_available!(email)

    pw = User.initial_password_from_email(email)
    user = nil
    profile = nil

    ActiveRecord::Base.transaction do
      user = User.create!(
        email: email,
        password: pw,
        password_confirmation: pw,
        role: :technician
      )
      profile = TechnicianProfile.create!(
        user: user,
        trade_type: trade_type.to_s.strip.presence || "Technician",
        location: location.to_s.strip.presence,
        experience_years: experience_years.present? ? experience_years.to_i : nil,
        availability: availability.to_s.strip.presence,
        bio: bio.to_s.strip.presence
      )
      user.generate_password_reset_token!
    end

    send_reset_email(user)
    { user: user, profile: profile }
  end

  def provision_company_login!(email:, company_profile_id:)
    email = normalize_email(email)
    assert_email_available!(email)

    profile = CompanyProfile.find_by(id: company_profile_id)
    raise Error, "Company not found" unless profile

    pw = User.initial_password_from_email(email)
    user = nil

    ActiveRecord::Base.transaction do
      user = User.create!(
        email: email,
        password: pw,
        password_confirmation: pw,
        role: :company,
        company_profile_id: profile.id
      )
      user.generate_password_reset_token!
    end

    send_reset_email(user)
    { user: user, profile: profile }
  end

  def send_reset_email(user)
    MailDelivery.safe_deliver do
      UserMailer.password_reset_instructions(user, reason: :admin_provisioned).deliver_now
    end
  end

  def normalize_email(email)
    e = email.to_s.strip.downcase
    raise Error, "Email is required" if e.blank?

    e
  end

  def assert_email_available!(email)
    return unless User.where("LOWER(email) = ?", email).exists?

    raise Error, "An account with this email already exists"
  end

  def normalize_cities(service_cities)
    case service_cities
    when Array
      service_cities.map { |x| x.to_s.strip.presence }.compact.uniq
    when String
      begin
        parsed = JSON.parse(service_cities)
        parsed.is_a?(Array) ? normalize_cities(parsed) : []
      rescue JSON::ParserError
        service_cities.split(",").map(&:strip).reject(&:blank?).uniq
      end
    else
      []
    end
  end

  def strip_or_nil(val)
    s = val.to_s.strip
    s.presence
  end

  def create_crm_prospect_for_company!(user:, profile:, contact_name: nil)
    notes_lines = []
    notes_lines << "Created automatically when admin provisioned this company account."
    notes_lines << "Facebook: #{profile.facebook_url}" if profile.facebook_url.present?
    notes_lines << "Instagram: #{profile.instagram_url}" if profile.instagram_url.present?
    notes_lines << "LinkedIn: #{profile.linkedin_url}" if profile.linkedin_url.present?

    CrmLead.create!(
      name: profile.company_name,
      contact_name: contact_name.to_s.strip.presence,
      email: user.email,
      phone: profile.phone,
      website: profile.website_url,
      status: "prospect",
      linked_user_id: user.id,
      linked_company_profile_id: profile.id,
      notes: notes_lines.join("\n")
    )
  end
end
