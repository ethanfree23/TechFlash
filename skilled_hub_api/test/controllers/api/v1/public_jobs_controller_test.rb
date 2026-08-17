# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class PublicJobsControllerTest < ActionDispatch::IntegrationTest
      test "returns job preview for valid share_token without authentication" do
        company_user = User.create!(
          email: "public-share-company@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          company_name: "Share Test Co",
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        job = Job.create!(
          company_profile: company_profile,
          title: "Public preview title",
          description: "Public preview description",
          status: :open,
          city: "Austin",
          state: "Texas",
          hourly_rate_cents: 35_000,
          hours_per_day: 8,
          days: 5
        )

        get "/api/v1/public/jobs/#{job.share_token}"

        assert_response :ok
        preview = JSON.parse(response.body)

        assert_equal job.id, preview["id"]
        assert_equal "Public preview title", preview["title"]
        assert_equal "Public preview description", preview["description"]
        assert_equal "open", preview["status"]
        assert_equal "open", preview["effective_status"]
        cp = preview["company_preview"]
        assert_equal company_profile.id, cp["id"]
        assert_equal "Share Test Co", cp["company_name"]

        refute preview.key?("latitude")
        refute preview.key?("longitude")
        refute preview.key?("address")
        refute preview.key?("notes")
        refute preview.key?("job_applications")
        refute preview.key?("payment_summary")
        refute preview.key?("company_charge_cents")
      end

      test "returns 404 for unknown share_token" do
        get "/api/v1/public/jobs/nonexistent-token-#{SecureRandom.hex(8)}"

        assert_response :not_found
        err = JSON.parse(response.body)
        assert_equal "Job not found", err["error"]
      end
    end
  end
end
