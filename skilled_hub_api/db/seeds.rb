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

def seed_clear_demo_data!
  # Order matters when foreign keys are enabled (PostgreSQL staging / SQLite).
  # Include payment / ACH tables that did not exist when this wipe list was first written.
  [
    "TimeEntryPayLine",
    "TimeEntry",
    "TransferRetryAuthorizationAudit",
    "TransferRetryAuthorization",
    "PaymentRiskEvent",
    "JobPaymentTransaction",
    "StripeSetupRecord",
    "StripeWebhookEvent",
    "AchFeatureAudit",
    "Message",
    "Conversation",
    "JobIssueReport",
    "Rating",
    "Payment",
    "JobApplication",
    "JobFinancialRevision",
    "JobTermChangeAudit",
    "JobTermination",
    "BackgroundCheck"
  ].each do |const_name|
    next unless Object.const_defined?(const_name)

    klass = Object.const_get(const_name)
    next unless klass.respond_to?(:table_exists?) && klass.table_exists?

    klass.delete_all
  end

  # Counter-offers: clear children before parents when parent_offer_id is present.
  if defined?(JobCounterOffer)
    JobCounterOffer.where.not(parent_offer_id: nil).delete_all
    JobCounterOffer.delete_all
  end

  SavedJobSearch.delete_all if defined?(SavedJobSearch)
  FavoriteTechnician.delete_all if defined?(FavoriteTechnician)
  Document.delete_all if defined?(Document)
  ReferralSubmission.delete_all if defined?(ReferralSubmission)

  if defined?(CrmNote)
    CrmNote.where.not(parent_note_id: nil).delete_all
    CrmNote.delete_all
  end
  CrmLead.delete_all if defined?(CrmLead)

  Job.delete_all
  FeedbackSubmission.delete_all if defined?(FeedbackSubmission)
  UserLoginEvent.delete_all if defined?(UserLoginEvent)

  User.update_all(company_profile_id: nil)
  CompanyProfile.delete_all
  TechnicianProfile.delete_all
  User.delete_all
end

def seed_or_find_user!(email:, role:, phone:)
  user = User.find_or_initialize_by(email: email)
  if user.new_record?
    user.assign_attributes(
      password: "Falcon23$!",
      password_confirmation: "Falcon23$!",
      role: role,
      phone: phone
    )
    user.save!
  else
    user.update!(role: role, phone: phone) if user.role.to_s != role.to_s || user.phone.to_s != phone.to_s
  end
  user
end

def seed_ach_flags!(admin_user:, cp1:, cp2:, cp3:)
  return unless Rails.env.staging? || ENV["SEED_ACH_FLAGS"].to_s.strip.casecmp("true").zero?

  AchAccess.set_global!(enabled: true, actor: admin_user, source: "seeds")
  AchAccess.set_company!(cp1, enabled: true, actor: admin_user, source: "seeds")
  AchAccess.set_company!(cp2, enabled: true, actor: admin_user, source: "seeds")
  AchAccess.set_company!(cp3, enabled: false, actor: admin_user, source: "seeds")
  puts "[seeds] ACH flags: global ON; FixIt+BuildRight enabled; NoAch LLC disabled"
end

seed_membership_tiers!

idempotent = Rails.env.staging? || ENV["SEED_IDEMPOTENT"].to_s.strip.casecmp("true").zero?
if idempotent && User.exists?(email: "admin@techflash.app")
  puts "[seeds] Idempotent re-seed (#{Rails.env}): refreshing users/profiles/ACH flags without wipe"
else
  seed_clear_demo_data!
end

# Users (password: Falcon23$! for all)
tech1 = seed_or_find_user!(email: "admin+tech1@techflash.app", role: :technician, phone: "713-555-0101")
tech2 = seed_or_find_user!(email: "admin+tech2@techflash.app", role: :technician, phone: "713-555-0102")
company1 = seed_or_find_user!(email: "admin+company1@techflash.app", role: :company, phone: "713-555-0201")
company2 = seed_or_find_user!(email: "admin+company2@techflash.app", role: :company, phone: "713-555-0202")
company3 = seed_or_find_user!(email: "admin+company3@techflash.app", role: :company, phone: "713-555-0203")
admin_user = seed_or_find_user!(email: "admin@techflash.app", role: :admin, phone: "713-555-0000")

# Profiles — tech1 is premium + Houston coords so dashboard map + membership delays match local dev (basic tier waits 48h after go-live per tier config).
hou_lat = BigDecimal("29.7604")
hou_lng = BigDecimal("-95.3698")

tech1_profile = tech1.technician_profile || TechnicianProfile.create!(
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
tech1_profile.update!(
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

tech2_profile = tech2.technician_profile || TechnicianProfile.create!(
  user: tech2,
  trade_type: "HVAC",
  experience_years: 6,
  availability: "Full-time",
  location: "Austin",
  phone: "713-555-0102"
)
tech2_profile.update!(
  trade_type: "HVAC",
  experience_years: 6,
  availability: "Full-time",
  location: "Austin",
  phone: "713-555-0102"
)

cp1 = company1.company_profile || CompanyProfile.create!(user: company1, company_name: "FixIt Inc", industry: "Construction", location: "Austin", phone: "713-555-0201")
cp1.update!(company_name: "FixIt Inc", industry: "Construction", location: "Austin", phone: "713-555-0201")
company1.update_column(:company_profile_id, cp1.id) if company1.company_profile_id != cp1.id

cp2 = company2.company_profile || CompanyProfile.create!(user: company2, company_name: "BuildRight Co", industry: "Commercial", location: "Dallas", phone: "713-555-0202")
cp2.update!(company_name: "BuildRight Co", industry: "Commercial", location: "Dallas", phone: "713-555-0202")
company2.update_column(:company_profile_id, cp2.id) if company2.company_profile_id != cp2.id

cp3 = company3.company_profile || CompanyProfile.create!(user: company3, company_name: "NoAch LLC", industry: "Residential", location: "Houston", phone: "713-555-0203")
cp3.update!(company_name: "NoAch LLC", industry: "Residential", location: "Houston", phone: "713-555-0203")
company3.update_column(:company_profile_id, cp3.id) if company3.company_profile_id != cp3.id

# Always re-assert ACH pilot flags on staging (and when SEED_ACH_FLAGS=true), even on idempotent re-runs.
seed_ach_flags!(admin_user: admin_user, cp1: cp1, cp2: cp2, cp3: cp3)

# Open jobs at distinct Houston-metro coordinates (so distances from tech1 are not all 0.0 mi).
seed_open_jobs = [
  ["Emergency pipe repair", cp1, BigDecimal("29.7174"), BigDecimal("-95.4178")],
  ["Commercial HVAC inspection", cp1, BigDecimal("29.7489"), BigDecimal("-95.2594")],
  ["Residential electrical panel", cp2, BigDecimal("29.8026"), BigDecimal("-95.5089")]
]

seed_open_jobs.each do |(title, company, job_lat, job_lng)|
  job = Job.find_or_initialize_by(company_profile: company, title: title)
  if job.new_record?
    job.assign_attributes(
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
    job.save!
  end
  job.update_columns(
    latitude: job_lat,
    longitude: job_lng,
    go_live_at: 72.hours.ago,
    status: Job.statuses[:open]
  )
end

puts "[seeds] Done (#{Rails.env})."
