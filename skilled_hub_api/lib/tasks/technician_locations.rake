# frozen_string_literal: true

namespace :technicians do
  desc "Read-only audit of technician lat/lng (never writes). Optional EMAIL=someone@example.com"
  task audit_locations: :environment do
    rows = TechnicianLocationRepair.audit(
      scope: email_scope
    )
    puts "invalid_count=#{rows.size}"
    rows.each { |row| puts format_location_row(row) }
  end

  desc "Read-only inspect of one technician. EMAIL=someone@example.com (prints even if coordinates are valid)"
  task inspect_location: :environment do
    email = ENV["EMAIL"].to_s.strip
    abort "EMAIL is required" if email.blank?

    rows = TechnicianLocationRepair.inspect_email(email)
    abort "no technician profile found for #{email}" if rows.empty?

    rows.each { |row| puts format_location_row(row) }
  end

  desc "Repair invalid technician coordinates. DRY_RUN=true to skip writes. EMAIL= for one user. FORCE=true to re-geocode valid coords too."
  task repair_locations: :environment do
    dry_run = ENV["DRY_RUN"].to_s == "true"
    force = ENV["FORCE"].to_s == "true"
    stats = TechnicianLocationRepair.repair!(
      dry_run: dry_run,
      force: force,
      email: ENV["EMAIL"]
    )
    puts "dry_run=#{dry_run} force=#{force} #{stats.inspect}"
  end

  def email_scope
    email = ENV["EMAIL"].to_s.strip.downcase
    scope = TechnicianProfile.includes(:user)
    return scope if email.blank?

    scope.joins(:user).where("LOWER(users.email) = ?", email)
  end

  def format_location_row(row)
    [
      "id=#{row.technician_profile_id}",
      "email=#{row.email}",
      "address=#{row.address.inspect}",
      "city=#{row.city}",
      "state=#{row.state}",
      "zip=#{row.zip_code}",
      "country=#{row.country}",
      "lat=#{row.latitude.inspect}",
      "lng=#{row.longitude.inspect}",
      "geocode_status=#{row.geocode_status}",
      "geocoded_at=#{row.geocoded_at}",
      "place_id=#{row.place_id.inspect}",
      "valid=#{row.valid_coordinates}",
      "reason=#{row.reason}"
    ].join(" ")
  end
end
