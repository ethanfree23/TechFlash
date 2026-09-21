# frozen_string_literal: true

require "test_helper"

# The funnel's business ZIP describes where the company is. Each job's location is supplied
# per job through the normal job-posting flow. These tests pin that separation, and pin that
# staffing intent is context only: it never creates jobs or sets potential_full_time.
class GhlCompanyBusinessZipIsolationTest < ActiveSupport::TestCase
  JOB_LOCATION_FIELDS = %w[zip_code address city state location latitude longitude].freeze

  setup do
    @previous_secret = ENV["GHL_WEBHOOK_SECRET"]
    ENV["GHL_WEBHOOK_SECRET"] = "unused-in-service-tests"
  end

  teardown do
    ENV["GHL_WEBHOOK_SECRET"] = @previous_secret
  end

  test "a job for a GHL-onboarded company does not inherit the business ZIP" do
    profile = onboard!(staffing_type: "both", business_zip: "77002")
    assert_equal "77002", profile.business_zip_code

    job = create_job!(profile)

    JOB_LOCATION_FIELDS.each do |field|
      assert_nil job.public_send(field), "job.#{field} must not be derived from the company's business ZIP"
    end
  end

  test "a job keeps the ZIP it was given, not the business ZIP" do
    profile = onboard!(staffing_type: "temporary", business_zip: "77002")

    job = GeocodingService.stub(:geocode, nil) { create_job!(profile, zip_code: "78701") }

    assert_equal "78701", job.zip_code
    refute_equal profile.business_zip_code, job.zip_code
  end

  test "Job has no attribute that reads the business ZIP" do
    refute Job.column_names.include?("business_zip_code")
    refute_includes Job.new.attributes.keys, "business_zip_code"
  end

  test "company profile serializers never expose the business ZIP to the job-posting UI" do
    profile = onboard!(staffing_type: "both", business_zip: "77002")

    [CompanyProfileSerializer, CompanyProfileDetailSerializer].each do |serializer|
      json = serializer.new(profile).as_json.deep_stringify_keys
      refute json.key?("business_zip_code"), "#{serializer} must not expose business_zip_code"
      refute_includes json.to_json, "77002", "#{serializer} must not leak the business ZIP value"
    end
  end

  %w[both full_time temporary].each do |staffing|
    test "staffing intent #{staffing} does not mark new jobs as potential full-time" do
      profile = onboard!(staffing_type: staffing, business_zip: "77002")

      job = create_job!(profile)

      assert_equal false, job.potential_full_time
      assert_equal({}, job.potential_full_time_details_hash)
    end
  end

  test "an individual job can still opt in to potential full-time itself" do
    profile = onboard!(staffing_type: "both", business_zip: "77002")

    job = create_job!(profile, potential_full_time: true)

    assert_equal true, job.potential_full_time
  end

  test "onboarding creates no jobs for any staffing intent" do
    assert_no_difference -> { Job.count } do
      %w[temporary full_time both].each_with_index do |staffing, i|
        onboard!(staffing_type: staffing, business_zip: "77002", suffix: i)
      end
    end
  end

  private

  def onboard!(staffing_type:, business_zip:, suffix: 0)
    result = GhlCompanyOnboardingService.call(
      "idempotency_key" => "iso-#{staffing_type}-#{suffix}",
      "ghl_contact_id" => "iso-contact-#{staffing_type}-#{suffix}",
      "ghl_location_id" => "loc_iso",
      "company_name" => "Isolation Co #{staffing_type} #{suffix}",
      "email" => "iso-#{staffing_type}-#{suffix}@example.com",
      "phone" => "71355#{format('%05d', 10_000 + suffix + (staffing_type.length * 100))}",
      "business_zip" => business_zip,
      "staffing_type" => staffing_type
    )
    assert_equal :accepted, result.http_status, result.body.inspect
    CompanyProfile.find(result.body[:company_profile_id])
  end

  def create_job!(profile, **attrs)
    Job.create!({
      company_profile: profile,
      title: "Isolation job",
      description: "desc",
      status: :open,
      hourly_rate_cents: 5_000,
      hours_per_day: 8,
      days: 1
    }.merge(attrs))
  end
end
