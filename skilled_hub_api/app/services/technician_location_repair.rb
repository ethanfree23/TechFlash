# frozen_string_literal: true

class TechnicianLocationRepair
  Row = Struct.new(
    :technician_profile_id,
    :email,
    :address,
    :city,
    :state,
    :zip_code,
    :country,
    :latitude,
    :longitude,
    :geocode_status,
    :geocoded_at,
    :place_id,
    :valid_coordinates,
    :reason,
    keyword_init: true
  )

  def self.audit(scope: TechnicianProfile.all)
    new(scope: scope).audit
  end

  def self.repair!(dry_run: false, force: false, email: nil)
    new(scope: TechnicianProfile.all, email: email).repair!(dry_run: dry_run, force: force)
  end

  def self.inspect_email(email)
    new(scope: TechnicianProfile.all, email: email).inspect_all
  end

  def initialize(scope:, email: nil)
    @scope = scope.includes(:user)
    @email = email.to_s.strip.downcase.presence
  end

  def audit
    invalid_profiles.map { |profile| row_for(profile) }
  end

  def inspect_all
    filtered_scope.to_a.map { |profile| row_for(profile) }
  end

  def repair!(dry_run: false, force: false)
    targets = force ? filtered_scope.to_a : invalid_profiles
    stats = { attempted: 0, success: 0, failed: 0, skipped: 0 }

    targets.each do |profile|
      current = CoordinateValidator.pair(profile.latitude, profile.longitude, country: profile.country)
      if current.valid? && !force
        stats[:skipped] += 1
        next
      end

      stats[:attempted] += 1
      coords = GeocodingService.geocode(
        address: profile.address,
        city: profile.city,
        state: profile.state,
        zip_code: profile.zip_code,
        country: profile.country
      )
      pair = coords && CoordinateValidator.pair(coords[0], coords[1], country: profile.country)
      if pair&.valid?
        unless dry_run
          profile.update_columns(
            latitude: pair.latitude,
            longitude: pair.longitude,
            geocode_status: "success",
            geocoded_at: Time.current,
            updated_at: Time.current
          )
        end
        stats[:success] += 1
      else
        unless dry_run
          profile.update_columns(
            latitude: nil,
            longitude: nil,
            geocode_status: "failed",
            geocoded_at: Time.current,
            updated_at: Time.current
          )
        end
        stats[:failed] += 1
      end
    end

    stats
  end

  private

  def filtered_scope
    rel = @scope
    return rel if @email.blank?

    rel.joins(:user).where("LOWER(users.email) = ?", @email)
  end

  def invalid_profiles
    filtered_scope.to_a.select do |profile|
      !CoordinateValidator.valid?(profile.latitude, profile.longitude, country: profile.country)
    end
  end

  def row_for(profile)
    result = CoordinateValidator.pair(profile.latitude, profile.longitude, country: profile.country)
    Row.new(
      technician_profile_id: profile.id,
      email: profile.user&.email,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      zip_code: profile.zip_code,
      country: profile.country,
      latitude: profile.latitude,
      longitude: profile.longitude,
      geocode_status: profile.try(:geocode_status),
      geocoded_at: profile.try(:geocoded_at),
      place_id: profile.try(:place_id),
      valid_coordinates: result.valid?,
      reason: result.reason || :ok
    )
  end
end
