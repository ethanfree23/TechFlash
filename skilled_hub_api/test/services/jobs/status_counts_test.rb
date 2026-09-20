# frozen_string_literal: true

require "test_helper"

module Jobs
  class StatusCountsTest < ActiveSupport::TestCase
    test "returns integer KPI counts for an empty relation" do
      counts = Jobs::StatusCounts.for(Job.none)

      assert_equal 0, counts[:total]
      assert_equal 0, counts[:open]
      assert_equal 0, counts[:completed]
      assert_equal 0, counts[:ended_early]
      assert_equal 0, counts[:counter_pending]
      counts.each_value { |value| assert_kind_of Integer, value }
    end

    test "counts jobs without raising on includes" do
      company_user = User.create!(
        email: "status-counts-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :company
      )
      company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
      company_user.update_column(:company_profile_id, company_profile.id)
      Job.create!(
        company_profile: company_profile,
        title: "Open job",
        description: "desc",
        status: :open,
        go_live_at: Time.current,
        hourly_rate_cents: 4000,
        hours_per_day: 8,
        days: 2
      )

      counts = Jobs::StatusCounts.for(Job.includes(:company_profile, :payments, job_applications: { technician_profile: :user }))

      assert_operator counts[:total], :>=, 1
      assert_kind_of Integer, counts[:counter_pending]
    end
  end
end
