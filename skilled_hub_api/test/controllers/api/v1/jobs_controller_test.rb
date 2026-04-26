require "test_helper"

module Api
  module V1
    class JobsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def reset_technician_tier_rules!(overrides = {})
        MembershipTierConfig.delete_all
        MembershipTierConfig.create!({
          audience: "technician",
          slug: "basic",
          display_name: "Basic",
          monthly_fee_cents: 0,
          commission_percent: 20,
          early_access_delay_hours: 0,
          job_access_min_experience_years: 0,
          job_access_min_jobs_completed: 0,
          job_access_min_successful_jobs: 0,
          job_access_min_profile_completeness_percent: 0,
          job_access_requires_verified_background: false,
          sort_order: 0
        }.merge(overrides))
        MembershipPolicy.invalidate_cache!
      end

      def with_mocked_company_has_payment_method(value)
        singleton = PaymentService.singleton_class
        original_exists = singleton.method_defined?(:company_has_payment_method?)
        original_method = PaymentService.method(:company_has_payment_method?) if original_exists

        singleton.send(:define_method, :company_has_payment_method?) { |_user| value }
        yield
      ensure
        if original_exists
          singleton.send(:define_method, :company_has_payment_method?, original_method)
        else
          singleton.send(:remove_method, :company_has_payment_method?)
        end
      end

      test "admin can create job for selected company when card validation is enabled and card exists" do
        admin = User.create!(
          email: "admin-job-create-enabled@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )
        company_user = User.create!(
          email: "company-selected-enabled@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        with_mocked_company_has_payment_method(true) do
          post "/api/v1/jobs",
               params: {
                 title: "Admin posted job with card check",
                 description: "desc",
                 status: "open",
                 company_profile_id: company_profile.id
               },
               headers: auth_header_for(admin),
               as: :json
        end

        assert_response :created
        created_job = Job.order(:id).last
        assert_equal company_profile.id, created_job.company_profile_id
      end

      test "admin cannot create job for selected company when card validation is enabled and no card exists" do
        admin = User.create!(
          email: "admin-job-create-blocked@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )
        company_user = User.create!(
          email: "company-selected-blocked@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        with_mocked_company_has_payment_method(false) do
          post "/api/v1/jobs",
               params: {
                 title: "Admin posted job blocked",
                 description: "desc",
                 status: "open",
                 company_profile_id: company_profile.id
               },
               headers: auth_header_for(admin),
               as: :json
        end

        assert_response :unprocessable_entity
      end

      test "admin can bypass card validation with toggle and create job without saved card" do
        admin = User.create!(
          email: "admin-job-create-bypass@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )
        company_user = User.create!(
          email: "company-selected-bypass@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        with_mocked_company_has_payment_method(false) do
          post "/api/v1/jobs",
               params: {
                 title: "Admin posted job bypassed",
                 description: "desc",
                 status: "open",
                 company_profile_id: company_profile.id,
                 skip_card_validation: true
               },
               headers: auth_header_for(admin),
               as: :json
        end

        assert_response :created
      end

      test "admin create requires valid company_profile_id" do
        admin = User.create!(
          email: "admin-job-create-no-company@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )

        post "/api/v1/jobs",
             params: {
               title: "Admin posted job missing company",
               description: "desc",
               status: "open"
             },
             headers: auth_header_for(admin),
             as: :json

        assert_response :unprocessable_entity
      end

      test "company create still enforces saved card requirement when not billing exempt" do
        user = User.create!(
          email: "company-enforce-card@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        profile = CompanyProfile.create!(
          user: user,
          membership_level: "basic",
          membership_fee_waived: false
        )
        user.update_column(:company_profile_id, profile.id)

        with_mocked_company_has_payment_method(false) do
          post "/api/v1/jobs",
               params: {
                 title: "Card required posting",
                 description: "Must fail without card",
                 status: "open",
                 company_profile_id: profile.id
               },
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :unprocessable_entity
      end

      test "company with waived membership fee can create job without saved card" do
        user = User.create!(
          email: "company-waived-posting@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        profile = CompanyProfile.create!(
          user: user,
          membership_level: "premium",
          membership_fee_waived: true
        )
        user.update_column(:company_profile_id, profile.id)

        post "/api/v1/jobs",
             params: {
               title: "Billing exempt posting",
               description: "Can post without saved card",
               status: "open",
               company_profile_id: profile.id
             },
             headers: auth_header_for(user),
             as: :json

        assert_response :created
      end

      test "technician can claim paid job for billing exempt company without payment method" do
        reset_technician_tier_rules!

        company_user = User.create!(
          email: "company-waived-claim@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "premium",
          membership_fee_waived: true
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        job = Job.create!(
          company_profile: company_profile,
          title: "Paid exempt claim",
          description: "desc",
          status: :open,
          hourly_rate_cents: 5_000,
          hours_per_day: 1,
          days: 1,
          scheduled_start_at: 1.hour.from_now,
          scheduled_end_at: 5.hours.from_now
        )

        technician_user = User.create!(
          email: "tech-waived-claim@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: technician_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic"
        )

        patch "/api/v1/jobs/#{job.id}/claim",
              headers: auth_header_for(technician_user),
              as: :json

        assert_response :ok
        job.reload
        assert_equal "filled", job.status
        assert_equal 0, job.payments.count
      end

      test "technician cannot claim a job before tier access window opens" do
        reset_technician_tier_rules!

        company_user = User.create!(
          email: "company-go-live-claim@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
        company_user.update_column(:company_profile_id, company_profile.id)

        job = Job.create!(
          company_profile: company_profile,
          title: "Future Go Live Job",
          description: "desc",
          status: :open,
          go_live_at: 6.hours.from_now,
          scheduled_start_at: 24.hours.from_now,
          scheduled_end_at: 26.hours.from_now
        )

        technician_user = User.create!(
          email: "tech-go-live-claim@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: technician_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic",
          experience_years: 10
        )

        patch "/api/v1/jobs/#{job.id}/claim",
              headers: auth_header_for(technician_user),
              as: :json

        assert_response :forbidden
      end
    end
  end
end
