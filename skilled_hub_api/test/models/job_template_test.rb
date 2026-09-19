# frozen_string_literal: true

require "test_helper"

class JobTemplateTest < ActiveSupport::TestCase
  test "every job column is classified as reusable or excluded" do
    unclassified = Job.column_names - JobTemplate::REUSABLE_FIELDS - JobTemplate::EXCLUDED_FIELDS
    assert_empty unclassified,
                 "Classify new Job columns as reusable or excluded before they can leak into templates: #{unclassified}"
  end

  test "reusable and excluded field lists do not overlap" do
    overlap = JobTemplate::REUSABLE_FIELDS & JobTemplate::EXCLUDED_FIELDS
    assert_empty overlap, "A field cannot be both reusable and excluded: #{overlap}"
  end

  test "builder copies only the reusable allowlist even when a job hash is poisoned" do
    user = User.create!(
      email: "tpl-model-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile = CompanyProfile.create!(
      user: user,
      membership_level: "premium",
      membership_fee_waived: true,
      job_funding_waived: true
    )
    job = Job.create!(
      company_profile: profile,
      title: "Allowlist job",
      description: "desc",
      status: :finished,
      hourly_rate_cents: 4_000,
      hours_per_day: 8,
      days: 5,
      pay_basis: :actual_hours_worked,
      scheduled_start_at: Time.zone.local(2027, 3, 1, 8, 0, 0),
      scheduled_end_at: Time.zone.local(2027, 3, 5, 17, 0, 0)
    )

    from_job = JobTemplates::Builder.from_job(job)
    assert_equal (from_job.keys - JobTemplate::SCHEDULE_META_KEYS).sort, (from_job.keys & JobTemplate::REUSABLE_FIELDS).sort
    refute from_job.key?("id")
    refute from_job.key?("status")
    refute from_job.key?("scheduled_start_at")

    poisoned = job.attributes.merge(
      "status" => "finished",
      "share_token" => job.share_token,
      "funding_status" => "funded",
      "job_applications" => [{ "technician_profile_id" => 99 }],
      "schedule_start_time" => "06:15"
    )
    from_attrs = JobTemplates::Builder.from_attributes(poisoned)
    extra = from_attrs.keys - JobTemplate::REUSABLE_FIELDS - JobTemplate::SCHEDULE_META_KEYS
    assert_empty extra, "from_attributes leaked #{extra}"
    assert_equal "06:15", from_attrs["schedule_start_time"]
    refute from_attrs.key?("share_token")
    refute from_attrs.key?("job_applications")
  end

  test "applier does not invent dates without a chosen start date" do
    template = JobTemplate.new(
      name: "Probe",
      configuration: {
        "title" => "Probe",
        "days" => 3,
        "hours_per_day" => 8,
        "standard_work_days" => [1, 2, 3, 4, 5],
        "schedule_start_time" => "08:00",
        "job_timezone" => "UTC"
      }
    )
    result = JobTemplates::Applier.call(template: template, start_date: nil)
    assert_nil result.start_at
    refute result.attributes.key?("scheduled_start_at")
    refute result.attributes.key?("scheduled_end_at")
  end
end
