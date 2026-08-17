# frozen_string_literal: true

require "test_helper"

class JobEffectiveStatusTest < ActiveSupport::TestCase
  include ActiveSupport::Testing::TimeHelpers

  setup do
    @company_user = User.create!(
      email: "status-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @company_profile = CompanyProfile.create!(
      user: @company_user,
      membership_level: "premium",
      membership_fee_waived: true
    )
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def create_job(attrs = {})
    Job.create!({
      company_profile: @company_profile,
      title: "Status job #{SecureRandom.hex(4)}",
      description: "desc",
      status: :open,
      hourly_rate_cents: 5_000,
      hours_per_day: 8,
      days: 2,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 3.days.from_now
    }.merge(attrs))
  end

  test "future open job is effectively open" do
    job = create_job(scheduled_end_at: 2.days.from_now)
    assert_equal "open", job.effective_status
    assert job.effectively_open?
    assert job.available_for_claim?
    refute job.listing_expired?
    assert_includes Job.effectively_open.ids, job.id
    refute_includes Job.expired_listings.ids, job.id
  end

  test "open job with null end date stays open" do
    job = create_job(scheduled_end_at: nil)
    assert_equal "open", job.effective_status
    assert job.available_for_claim?
  end

  test "raw open job past scheduled_end_at is expired" do
    job = create_job(scheduled_end_at: 2.days.ago)
    assert_equal "open", job.status
    assert_equal "expired", job.effective_status
    refute job.effectively_open?
    refute job.available_for_claim?
    assert job.listing_expired?
    refute_includes Job.effectively_open.ids, job.id
    assert_includes Job.expired_listings.ids, job.id
  end

  test "completed job with past dates stays completed" do
    job = create_job(status: :finished, scheduled_start_at: 5.days.ago, scheduled_end_at: 2.days.ago, finished_at: 1.day.ago)
    assert_equal "completed", job.effective_status
    refute job.listing_expired?
    assert_includes Job.effectively_completed.ids, job.id
    refute_includes Job.expired_listings.ids, job.id
  end

  test "claimed job with past dates stays claimed or active" do
    upcoming = create_job(status: :filled, scheduled_start_at: 2.days.from_now, scheduled_end_at: 5.days.from_now)
    started = create_job(status: :filled, scheduled_start_at: 2.days.ago, scheduled_end_at: 2.days.from_now)

    assert_equal "claimed", upcoming.effective_status
    assert_equal "active", started.effective_status
    assert_includes Job.in_progress.ids, upcoming.id
    assert_includes Job.in_progress.ids, started.id
    refute_includes Job.expired_listings.ids, upcoming.id
    refute_includes Job.expired_listings.ids, started.id
  end

  test "manually closed pending_funding job is not open or expired" do
    job = create_job(status: :pending_funding, scheduled_end_at: 2.days.ago)
    assert_equal "pending_funding", job.effective_status
    refute job.effectively_open?
    refute job.listing_expired?
  end

  test "rolling-start job with no end date stays open" do
    job = create_job(
      start_mode: :rolling_start,
      rolling_start_rule_type: :days_after_acceptance,
      rolling_start_days_after_acceptance: 2,
      scheduled_start_at: nil,
      scheduled_end_at: nil
    )
    assert_equal "open", job.effective_status
    assert job.available_for_claim?
  end

  test "rolling-start job with past end date is expired" do
    job = create_job(
      start_mode: :rolling_start,
      rolling_start_rule_type: :days_after_acceptance,
      rolling_start_days_after_acceptance: 2,
      scheduled_end_at: 1.hour.ago
    )
    assert_equal "expired", job.effective_status
    refute job.available_for_claim?
  end

  test "counter pending is an overlay and does not change primary status" do
    job = create_job(scheduled_end_at: 2.days.from_now)
    tech_user = User.create!(
      email: "status-tech-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    tech_profile = TechnicianProfile.create!(
      user: tech_user,
      trade_type: "General",
      availability: "Full-time",
      membership_level: "basic"
    )
    JobCounterOffer.create!(
      job: job,
      technician_profile: tech_profile,
      company_profile: @company_profile,
      status: :pending_company,
      created_by_role: :technician,
      proposed_hourly_rate_cents: 6_000,
      proposed_hours_per_day: 8,
      proposed_days: 2,
      proposed_start_mode: :rolling_start
    )

    assert_equal "open", job.reload.effective_status
    assert_includes Job.with_pending_counter_offer.ids, job.id
    counts = Jobs::StatusCounts.for(Job.where(id: job.id))
    assert_equal 1, counts[:open]
    assert_equal 1, counts[:counter_pending]
    assert_equal 0, counts[:expired]
  end

  test "expiration boundary is open at exact timestamp and expired immediately after" do
    freeze_at = Time.utc(2026, 8, 17, 18, 0, 0)
    job = nil
    travel_to freeze_at do
      job = create_job(scheduled_end_at: freeze_at)
      assert_equal "open", job.effective_status
      assert job.available_for_claim?
    end

    travel_to freeze_at - 1.second do
      assert_equal "open", job.reload.effective_status
    end

    travel_to freeze_at + 1.second do
      assert_equal "expired", job.reload.effective_status
      refute job.available_for_claim?
    end
  end

  test "expiration comparison uses Time.current not a job timezone override" do
    freeze_at = Time.utc(2026, 8, 17, 18, 0, 0)
    travel_to freeze_at do
      still_open = create_job(scheduled_end_at: freeze_at, job_timezone: "America/Chicago")
      expired = create_job(scheduled_end_at: freeze_at - 1.second, job_timezone: "America/Chicago")
      assert_equal "open", still_open.effective_status
      assert_equal "expired", expired.effective_status
    end
  end
end
