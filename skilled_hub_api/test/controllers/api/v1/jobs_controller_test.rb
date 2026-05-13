require "test_helper"

module Api
  module V1
    class JobsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def reset_technician_tier_rules!(overrides = {})
        # Preserve company tier rows — deleting all audiences breaks company pricing and can skew API behavior.
        MembershipTierConfig.where(audience: "technician").delete_all
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

      test "company create defaults status to open when omitted" do
        user = User.create!(
          email: "company-default-open@example.com",
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
               title: "Missing status job",
               description: "Status should default to open"
             },
             headers: auth_header_for(user),
             as: :json

        assert_response :created
        created_job = Job.order(:id).last
        assert_equal "open", created_job.status
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

      test "rolling start job uses technician preferred_start_at when claimed" do
        reset_technician_tier_rules!

        company_user = User.create!(
          email: "company-rolling-claim@example.com",
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

        technician_user = User.create!(
          email: "tech-rolling-claim@example.com",
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

        travel_to Time.zone.parse("2026-04-27 14:00:00") do
          job = Job.create!(
            company_profile: company_profile,
            title: "Rolling start claim",
            description: "desc",
            status: :open,
            go_live_at: 3.days.ago,
            start_mode: :rolling_start,
            hourly_rate_cents: 3_000,
            hours_per_day: 8,
            days: 3,
            scheduled_end_at: 1.week.from_now
          )

          preferred_start = Time.zone.parse("2026-04-28 09:30:00")
          patch "/api/v1/jobs/#{job.id}/claim",
                params: { preferred_start_at: preferred_start.iso8601 },
                headers: auth_header_for(technician_user),
                as: :json
          assert_response :ok
          job.reload
          assert_equal "filled", job.status
          assert_in_delta preferred_start.to_f, job.scheduled_start_at.to_f, 1.0
        end
      end

      test "rolling start with days-after-acceptance rule sets start from claim time" do
        reset_technician_tier_rules!

        company_user = User.create!(email: "company-rolling-days@example.com", password: "password123", password_confirmation: "password123", role: :company)
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "premium", membership_fee_waived: true)
        company_user.update_column(:company_profile_id, company_profile.id)
        technician_user = User.create!(email: "tech-rolling-days@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        TechnicianProfile.create!(user: technician_user, trade_type: "General", availability: "Full-time", membership_level: "basic")

        travel_to Time.zone.parse("2026-04-29 08:00:00") do
          job = Job.create!(
            company_profile: company_profile, title: "Rolling days rule", description: "desc", status: :open,
            start_mode: :rolling_start, rolling_start_rule_type: :days_after_acceptance, rolling_start_days_after_acceptance: 2,
            hourly_rate_cents: 3_000, hours_per_day: 8, days: 5, go_live_at: 1.day.ago
          )

          patch "/api/v1/jobs/#{job.id}/claim", headers: auth_header_for(technician_user), as: :json
          assert_response :ok
          job.reload
          assert_in_delta (Time.current + 2.days).to_f, job.scheduled_start_at.to_f, 1.0
        end
      end

      test "rolling start with following-weekday rule uses next week's same day when matched" do
        reset_technician_tier_rules!

        company_user = User.create!(email: "company-rolling-weekday@example.com", password: "password123", password_confirmation: "password123", role: :company)
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "premium", membership_fee_waived: true)
        company_user.update_column(:company_profile_id, company_profile.id)
        technician_user = User.create!(email: "tech-rolling-weekday@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        TechnicianProfile.create!(user: technician_user, trade_type: "General", availability: "Full-time", membership_level: "basic")

        travel_to Time.zone.parse("2026-04-27 10:00:00") do # Monday
          job = Job.create!(
            company_profile: company_profile, title: "Rolling weekday rule", description: "desc", status: :open,
            start_mode: :rolling_start, rolling_start_rule_type: :following_weekday, rolling_start_weekday: 1, rolling_start_weekday_time: "14:15",
            hourly_rate_cents: 3_000, hours_per_day: 8, days: 2, go_live_at: 1.day.ago
          )

          patch "/api/v1/jobs/#{job.id}/claim", headers: auth_header_for(technician_user), as: :json
          assert_response :ok
          job.reload
          assert_equal Time.zone.parse("2026-05-04 14:15:00"), job.scheduled_start_at
        end
      end

      test "rolling start claim at late hour computes end time without invalid hour overflow" do
        reset_technician_tier_rules!

        company_user = User.create!(email: "company-rolling-late-hour@example.com", password: "password123", password_confirmation: "password123", role: :company)
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "premium", membership_fee_waived: true)
        company_user.update_column(:company_profile_id, company_profile.id)
        technician_user = User.create!(email: "tech-rolling-late-hour@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        TechnicianProfile.create!(user: technician_user, trade_type: "General", availability: "Full-time", membership_level: "basic")

        travel_to Time.zone.parse("2026-05-01 18:30:00") do
          job = Job.create!(
            company_profile: company_profile,
            title: "Rolling late hour claim",
            description: "desc",
            status: :open,
            start_mode: :rolling_start,
            hourly_rate_cents: 3_000,
            hours_per_day: 12,
            days: 1,
            go_live_at: 1.day.ago
          )

          preferred_start = Time.zone.parse("2026-05-01 18:30:00")
          patch "/api/v1/jobs/#{job.id}/claim",
                params: { preferred_start_at: preferred_start.iso8601 },
                headers: auth_header_for(technician_user),
                as: :json
          assert_response :ok
          job.reload
          assert_equal "filled", job.status
          assert_equal preferred_start, job.scheduled_start_at
          assert_equal Time.zone.parse("2026-05-02 07:30:00"), job.scheduled_end_at
        end
      end

      test "creating an open job sets go_live_at to now" do
        user = User.create!(
          email: "company-go-live-now-create@example.com",
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

        travel_to Time.zone.parse("2026-04-25 23:00:00") do
          post "/api/v1/jobs",
               params: {
                 title: "Immediate go-live",
                 description: "Posted now",
                 status: "open",
                 company_profile_id: profile.id,
                 go_live_at: 3.days.from_now
               },
               headers: auth_header_for(user),
               as: :json

          assert_response :created
          created_job = Job.order(:id).last
          assert_in_delta Time.current.to_f, created_job.go_live_at.to_f, 1.0
        end
      end

      test "updating a non-open job to open sets go_live_at to now" do
        user = User.create!(
          email: "company-go-live-now-update@example.com",
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

        job = Job.create!(
          company_profile: profile,
          title: "Reserved job",
          description: "desc",
          status: :reserved,
          go_live_at: 2.days.from_now
        )

        travel_to Time.zone.parse("2026-04-26 10:30:00") do
          patch "/api/v1/jobs/#{job.id}",
                params: { status: "open" },
                headers: auth_header_for(user),
                as: :json

          assert_response :ok
          job.reload
          assert_in_delta Time.current.to_f, job.go_live_at.to_f, 1.0
        end
      end

      test "company cannot set job to open while accepted application exists" do
        user = User.create!(
          email: "company-block-open-claimed@example.com",
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

        technician_user = User.create!(
          email: "tech-block-open-claimed@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        technician_profile = TechnicianProfile.create!(
          user: technician_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic"
        )

        job = Job.create!(
          company_profile: profile,
          title: "Filled job",
          description: "desc",
          status: :filled,
          go_live_at: 1.day.ago,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 2.days.from_now
        )
        JobApplication.create!(
          job: job,
          technician_profile: technician_profile,
          status: :accepted
        )

        patch "/api/v1/jobs/#{job.id}",
              params: { status: "open" },
              headers: auth_header_for(user),
              as: :json

        assert_response :unprocessable_entity
        job.reload
        assert_equal "filled", job.status
      end

      test "updating an open job with a future go_live_at resets go_live_at to now" do
        user = User.create!(
          email: "company-go-live-open-update@example.com",
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

        job = Job.create!(
          company_profile: profile,
          title: "Open job",
          description: "desc",
          status: :open,
          go_live_at: 2.hours.ago
        )

        travel_to Time.zone.parse("2026-04-26 11:30:00") do
          patch "/api/v1/jobs/#{job.id}",
                params: {
                  title: "Open job updated",
                  go_live_at: 3.days.from_now
                },
                headers: auth_header_for(user),
                as: :json

          assert_response :ok
          job.reload
          assert_in_delta Time.current.to_f, job.go_live_at.to_f, 1.0
        end
      end

      test "deny reopens claimed job and sets go_live_at to now" do
        company_user = User.create!(
          email: "company-deny-reopen@example.com",
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

        technician_user = User.create!(
          email: "tech-deny-reopen@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        technician_profile = TechnicianProfile.create!(
          user: technician_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic"
        )

        job = Job.create!(
          company_profile: company_profile,
          title: "Claimed job",
          description: "desc",
          status: :filled,
          go_live_at: 2.days.from_now,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 2.days.from_now
        )
        JobApplication.create!(
          job: job,
          technician_profile: technician_profile,
          status: :accepted
        )

        travel_to Time.zone.parse("2026-04-26 12:00:00") do
          patch "/api/v1/jobs/#{job.id}/deny",
                headers: auth_header_for(company_user),
                as: :json

          assert_response :ok
          job.reload
          assert_equal "open", job.status
          assert_in_delta Time.current.to_f, job.go_live_at.to_f, 1.0
        end
      end

      test "technician index succeeds when membership visibility checks require full job attributes" do
        reset_technician_tier_rules!(job_access_min_experience_years: 2)

        company_user = User.create!(
          email: "company-tech-index-safety@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        visible_job = Job.create!(
          company_profile: company_profile,
          title: "Visible open job",
          description: "desc",
          status: :open,
          minimum_years_experience: 1,
          go_live_at: 2.hours.ago,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 2.days.from_now
        )

        technician_user = User.create!(
          email: "tech-index-safety@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: technician_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic",
          experience_years: 5
        )

        get "/api/v1/jobs",
            headers: auth_header_for(technician_user),
            as: :json

        assert_response :ok
        ids = JSON.parse(response.body).map { |row| row["id"] }
        assert_includes ids, visible_job.id
      end

      test "technician index does not 500 with mixed eligibility jobs under strict membership rules" do
        reset_technician_tier_rules!(job_access_min_experience_years: 4)

        company_user = User.create!(
          email: "company-tech-index-mixed@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        eligible_job = Job.create!(
          company_profile: company_profile,
          title: "Eligible open job",
          description: "desc",
          status: :open,
          minimum_years_experience: 2,
          go_live_at: 1.hour.ago,
          scheduled_start_at: 12.hours.from_now,
          scheduled_end_at: 14.hours.from_now
        )

        ineligible_job = Job.create!(
          company_profile: company_profile,
          title: "Ineligible open job",
          description: "desc",
          status: :open,
          minimum_years_experience: 7,
          go_live_at: 1.hour.ago,
          scheduled_start_at: 15.hours.from_now,
          scheduled_end_at: 17.hours.from_now
        )

        technician_user = User.create!(
          email: "tech-index-mixed@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: technician_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic",
          experience_years: 5
        )

        get "/api/v1/jobs",
            headers: auth_header_for(technician_user),
            as: :json

        assert_response :ok
        ids = JSON.parse(response.body).map { |row| row["id"] }
        assert_includes ids, eligible_job.id
        assert_not_includes ids, ineligible_job.id
      end

      test "premium technician excluded from open index until experience_years meets job minimum_years_experience" do
        MembershipTierConfig.where(audience: "technician").delete_all
        MembershipTierConfig.create!(
          audience: "technician",
          slug: "premium",
          display_name: "Premium",
          monthly_fee_cents: 24_900,
          commission_percent: 10,
          early_access_delay_hours: 0,
          job_access_min_experience_years: 0,
          job_access_min_jobs_completed: 0,
          job_access_min_successful_jobs: 0,
          job_access_min_profile_completeness_percent: 0,
          job_access_requires_verified_background: false,
          sort_order: 0
        )
        MembershipTierConfig.create!(
          audience: "technician",
          slug: "pro",
          display_name: "Pro",
          monthly_fee_cents: 4900,
          commission_percent: 20,
          early_access_delay_hours: 12,
          job_access_min_experience_years: 0,
          sort_order: 1
        )
        MembershipTierConfig.create!(
          audience: "technician",
          slug: "basic",
          display_name: "Basic",
          monthly_fee_cents: 0,
          commission_percent: 20,
          early_access_delay_hours: 24,
          job_access_min_experience_years: 0,
          sort_order: 2
        )
        MembershipPolicy.invalidate_cache!

        company_user = User.create!(
          email: "company-premium-exp-gate@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        job = Job.create!(
          company_profile: company_profile,
          title: "Electrician five plus years",
          description: "desc",
          status: :open,
          minimum_years_experience: 5,
          go_live_at: 1.hour.ago,
          scheduled_start_at: 12.hours.from_now,
          scheduled_end_at: 14.hours.from_now
        )

        technician_user = User.create!(
          email: "premium-tech-exp-gate@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: technician_user,
          trade_type: "Electrician",
          availability: "Full-time",
          membership_level: "premium",
          experience_years: 1
        )

        get "/api/v1/jobs",
            params: { status: "open", include_past: "true" },
            headers: auth_header_for(technician_user).merge("Accept" => "application/json")

        assert_response :ok
        ids = JSON.parse(response.body).map { |row| row["id"] }
        assert_not_includes ids, job.id

        technician_user.technician_profile.update_column(:experience_years, 5)

        get "/api/v1/jobs",
            params: { status: "open", include_past: "true" },
            headers: auth_header_for(technician_user).merge("Accept" => "application/json")

        assert_response :ok
        ids = JSON.parse(response.body).map { |row| row["id"] }
        assert_includes ids, job.id
      end
    end
  end
end
