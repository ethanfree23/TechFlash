# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class PostPublishFundingAccessControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      setup do
        PlatformSetting.where(key: PostPublishFundingAccess::SETTING_KEY).delete_all
        ENV.delete(PostPublishFundingAccess::ENV_KEY)
        @company_user = User.create!(
          email: "ppf-flag-#{SecureRandom.hex(3)}@example.com",
          password: "password123", password_confirmation: "password123", role: :company,
          stripe_customer_id: "cus_ppf"
        )
        @cp = CompanyProfile.create!(
          user: @company_user, membership_level: "basic", phone: "713-555-5500",
          company_name: "PPF Flag Co", job_funding_waived: true
        )
        @company_user.update_column(:company_profile_id, @cp.id)
      end

      teardown do
        ENV.delete(PostPublishFundingAccess::ENV_KEY)
        PlatformSetting.where(key: PostPublishFundingAccess::SETTING_KEY).delete_all
      end

      def waived_job
        job = Job.create!(
          company_profile: @cp,
          title: "waived for fund flag",
          description: "d",
          status: :pending_funding,
          pay_basis: :guaranteed_job_pay,
          hourly_rate_cents: 5_000,
          hours_per_day: 8,
          days: 1,
          agreed_labor_cents: 40_000,
          go_live_at: Time.current
        )
        JobFundingService.fund_for_publish!(job)
        job.reload
      end

      test "defaults OFF" do
        refute PostPublishFundingAccess.enabled?
      end

      test "ENV true enables" do
        ENV[PostPublishFundingAccess::ENV_KEY] = "true"
        assert PostPublishFundingAccess.enabled?
      end

      test "PlatformSetting enables when ENV absent" do
        PostPublishFundingAccess.set_enabled!(enabled: true)
        assert PostPublishFundingAccess.enabled?
      end

      test "fund_preview and fund refuse when OFF" do
        job = waived_job
        refute PostPublishFundingAccess.enabled?

        get "/api/v1/jobs/#{job.id}/fund_preview", headers: auth_header_for(@company_user)
        assert_response :forbidden
        body = JSON.parse(response.body)
        assert_equal "post_publish_funding_disabled", body["code"]

        post "/api/v1/jobs/#{job.id}/fund",
             params: { confirmed_amount_cents: 1, confirmed_payment_method_id: "pm_x" },
             headers: auth_header_for(@company_user),
             as: :json
        assert_response :forbidden
        assert_equal "post_publish_funding_disabled", JSON.parse(response.body)["code"]
      end

      test "fund_preview succeeds when ON" do
        PostPublishFundingAccess.set_enabled!(enabled: true)
        job = waived_job

        get "/api/v1/jobs/#{job.id}/fund_preview", headers: auth_header_for(@company_user)
        assert_response :ok
        body = JSON.parse(response.body)
        assert body["amount_due_cents"].to_i.positive?
        assert_equal true, body["post_publish_funding_enabled"]
      end
    end
  end
end
