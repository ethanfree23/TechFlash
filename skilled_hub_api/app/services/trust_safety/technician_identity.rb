# frozen_string_literal: true

module TrustSafety
  # Person-first identity payload for admin Trust & Safety surfaces. Every review item
  # is organized around the technician, never around a raw database row.
  class TechnicianIdentity
    extend ActiveStorageUrlHelper

    # Eager-load everything +for+ touches so callers can batch users without N+1.
    def self.preload_scope(scope)
      scope.includes(technician_profile: { avatar_attachment: :blob })
    end

    def self.for(user)
      return nil if user.nil?

      profile = user.technician_profile
      first = user.first_name.to_s.strip
      last = user.last_name.to_s.strip
      full_name = [first, last].reject(&:blank?).join(" ").presence
      display_name = full_name || user.email.to_s.split("@").first.presence || "Technician ##{user.id}"
      city = profile&.city.to_s.strip.presence
      state = profile&.state.to_s.strip.presence
      state_abbr = state && defined?(UsAddress) ? (UsAddress.state_abbreviation(state).presence || state) : state

      {
        user_id: user.id,
        technician_profile_id: profile&.id,
        first_name: first.presence,
        last_name: last.presence,
        full_name: full_name,
        display_name: display_name,
        has_real_name: full_name.present?,
        initials: initials_for(first, last, user.email),
        email: user.email,
        phone: user.phone.presence || profile&.phone.presence,
        avatar_url: profile ? absolute_blob_url(profile.avatar) : nil,
        avatar_updated_at: profile&.updated_at&.iso8601,
        trade: profile&.trade_type.to_s.strip.presence,
        skill_class: profile&.skill_class.to_s.strip.presence,
        specialties: Array(profile&.specialties).map(&:to_s).reject(&:blank?).first(4),
        city: city,
        state: state_abbr,
        location_label: [city, state_abbr].compact.join(", ").presence || profile&.location.to_s.strip.presence,
        experience_years: profile&.experience_years,
        account_status: account_status_for(user),
        background_verified: profile&.background_verified == true,
        role: user.role,
        joined_at: user.created_at&.iso8601,
        admin_user_path: "/admin/users/#{user.id}"
      }
    end

    def self.initials_for(first, last, email)
      a = first.to_s[0]
      b = last.to_s[0]
      letters = [a, b].compact.join
      letters = email.to_s[0, 2] if letters.blank?
      letters.to_s.upcase.presence || "?"
    end

    def self.account_status_for(user)
      return "admin" if user.admin?
      return "invited" if user.password_digest.blank?

      "active"
    end
  end
end
