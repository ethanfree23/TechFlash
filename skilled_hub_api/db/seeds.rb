# frozen_string_literal: true

# Seeds refuse to run in production.
if Rails.env.production?
  abort("[seeds] Refusing to seed in production.")
end

# Idempotent membership tier configs MUST exist before any profile create
# (TechnicianProfile/CompanyProfile normalize_membership_level via MembershipPolicy).
def seed_membership_tiers!
  now = Time.current
  rows = [
    { audience: "technician", slug: "basic", display_name: "Basic", monthly_fee_cents: 0, commission_percent: 20.0, early_access_delay_hours: 48, sort_order: 0, stripe_price_id: nil },
    { audience: "technician", slug: "pro", display_name: "Pro", monthly_fee_cents: 4_900, commission_percent: 20.0, early_access_delay_hours: 24, sort_order: 1, stripe_price_id: nil },
    { audience: "technician", slug: "premium", display_name: "Premium", monthly_fee_cents: 24_900, commission_percent: 10.0, early_access_delay_hours: 0, sort_order: 2, stripe_price_id: nil },
    { audience: "company", slug: "basic", display_name: "Basic", monthly_fee_cents: 0, commission_percent: 10.0, early_access_delay_hours: nil, sort_order: 0, stripe_price_id: nil },
    { audience: "company", slug: "pro", display_name: "Pro", monthly_fee_cents: 25_000, commission_percent: 5.0, early_access_delay_hours: nil, sort_order: 1, stripe_price_id: nil },
    { audience: "company", slug: "premium", display_name: "Premium", monthly_fee_cents: 100_000, commission_percent: 10.0, early_access_delay_hours: nil, sort_order: 2, stripe_price_id: nil }
  ]
  MembershipTierConfig.insert_all(
    rows.map { |r| r.merge(created_at: now, updated_at: now) },
    unique_by: %i[audience slug]
  )
  MembershipTierConfig.where(audience: "technician", slug: "premium").update_all(waives_background_check_fee: true)
  MembershipTierConfig.where(audience: "company", slug: "premium").update_all(commission_percent: 10.0)
end

seed_membership_tiers!

# Clear old data — order matters when foreign keys are enabled (SQLite).
Message.delete_all
Conversation.delete_all
JobIssueReport.delete_all
Rating.delete_all
Payment.delete_all
JobApplication.delete_all
JobCounterOffer.where.not(parent_offer_id: nil).delete_all
JobCounterOffer.delete_all
SavedJobSearch.delete_all
FavoriteTechnician.delete_all
Document.delete_all
ReferralSubmission.delete_all
CrmNote.where.not(parent_note_id: nil).delete_all
CrmNote.delete_all
CrmLead.delete_all
Job.delete_all
FeedbackSubmission.delete_all
UserLoginEvent.delete_all
User.update_all(company_profile_id: nil)
CompanyProfile.delete_all
TechnicianProfile.delete_all
User.delete_all

# Users (password: Falcon23$! for all)
tech1 = User.create!(email: "admin+tech1@techflash.app", password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :technician, phone: "713-555-0101")
tech2 = User.create!(email: "admin+tech2@techflash.app", password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :technician, phone: "713-555-0102")
company1 = User.create!(email: "admin+company1@techflash.app", password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :company, phone: "713-555-0201")
company2 = User.create!(email: "admin+company2@techflash.app", password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :company, phone: "713-555-0202")
company3 = User.create!(email: "admin+company3@techflash.app", password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :company, phone: "713-555-0203")
admin_user = User.create!(email: "admin@techflash.app", password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :admin, phone: "713-555-0000")

# Profiles — tech1 is premium + Houston coords so dashboard map + membership delays match local dev (basic tier waits 48h after go-live per tier config).
hou_lat = BigDecimal("29.7604")
hou_lng = BigDecimal("-95.3698")

tech1_profile = TechnicianProfile.create!(
  user: tech1,
  trade_type: "Plumber",
  experience_years: 4,
  availability: "Weekdays",
  location: "Houston, TX",
  membership_level: "premium",
  address: "1200 Smith St",
  city: "Houston",
  state: "TX",
  zip_code: "77002",
  country: "United States",
  bio: "Seeded demo technician",
  phone: "713-555-0101"
)
tech1_profile.update_columns(latitude: hou_lat, longitude: hou_lng)

TechnicianProfile.create!(
  user: tech2,
  trade_type: "HVAC",
  experience_years: 6,
  availability: "Full-time",
  location: "Austin",
  phone: "713-555-0102"
)
cp1 = CompanyProfile.create!(user: company1, company_name: "FixIt Inc", industry: "Construction", location: "Austin", phone: "713-555-0201")
cp2 = CompanyProfile.create!(user: company2, company_name: "BuildRight Co", industry: "Commercial", location: "Dallas", phone: "713-555-0202")
cp3 = CompanyProfile.create!(user: company3, company_name: "NoAch LLC", industry: "Residential", location: "Houston", phone: "713-555-0203")

# Staging ACH pilot flags: global ON, two companies enabled, one disabled.
if Rails.env.staging? || ENV["SEED_ACH_FLAGS"].to_s.strip.casecmp("true").zero?
  AchAccess.set_global!(enabled: true, actor: admin_user, source: "seeds")
  AchAccess.set_company!(cp1, enabled: true, actor: admin_user, source: "seeds")
  AchAccess.set_company!(cp2, enabled: true, actor: admin_user, source: "seeds")
  AchAccess.set_company!(cp3, enabled: false, actor: admin_user, source: "seeds")
  puts "[seeds] ACH flags: global ON; FixIt+BuildRight enabled; NoAch LLC disabled"
end

# Open jobs at distinct Houston-metro coordinates (so distances from tech1 are not all 0.0 mi).
seed_open_jobs = [
  ["Emergency pipe repair", cp1, BigDecimal("29.7174"), BigDecimal("-95.4178")],
  ["Commercial HVAC inspection", cp1, BigDecimal("29.7489"), BigDecimal("-95.2594")],
  ["Residential electrical panel", cp2, BigDecimal("29.8026"), BigDecimal("-95.5089")]
]

seed_open_jobs.each do |(title, company, job_lat, job_lng)|
  job = Job.create!(
    company_profile: company,
    title: title,
    description: "Seeded open job for local development.",
    status: :open,
    city: "Houston",
    state: "TX",
    country: "United States",
    hourly_rate_cents: 7500,
    hours_per_day: 8,
    days: 1,
    scheduled_end_at: 14.days.from_now,
    minimum_years_experience: 0
  )
  job.update_columns(
    latitude: job_lat,
    longitude: job_lng,
    go_live_at: 72.hours.ago
  )
end

puts "[seeds] Done (#{Rails.env})."
