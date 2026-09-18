require "test_helper"

module Api
  module V1
    class JobTemplatesControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def create_company(suffix: SecureRandom.hex(4))
        user = User.create!(
          email: "tpl-co-#{suffix}@example.com",
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
        user.update_column(:company_profile_id, profile.id)
        [user, profile]
      end

      def monday(week_offset = 0)
        base = Date.new(2027, 3, 1)
        base += (1 - base.cwday) % 7
        base + (week_offset * 7)
      end

      def at(date, hour)
        Time.find_zone!("UTC").local(date.year, date.month, date.day, hour, 0, 0)
      end

      def create_job(profile, **overrides)
        Job.create!(
          {
            company_profile: profile,
            title: "HVAC Install Helper",
            description: "Install support",
            status: :open,
            go_live_at: 3.days.ago,
            start_mode: :hard_start,
            scheduled_start_at: at(monday(0), 8),
            scheduled_end_at: at(monday(1) + 4, 17),
            hourly_rate_cents: 2_500,
            hours_per_day: 8,
            days: 10,
            skill_class: "Apprentice",
            job_timezone: "UTC",
            standard_work_days: [1, 2, 3, 4, 5],
            pay_basis: :guaranteed_job_pay,
            potential_full_time: true,
            schedule_flexibility: :hard_end,
            notes: "Bring hand tools",
            required_certifications: "EPA 608",
            require_background_check: true,
            minimum_years_experience: 2,
            city: "Houston",
            state: "TX"
          }.merge(overrides)
        )
      end

      test "company can save a completed job as a template" do
        user, profile = create_company
        job = create_job(profile)

        post "/api/v1/job_templates",
             params: { name: "HVAC Install Helper - 10 days", from_job_id: job.id },
             headers: auth_header_for(user),
             as: :json

        assert_response :created
        body = JSON.parse(response.body)
        config = body["configuration"]

        assert_equal "HVAC Install Helper - 10 days", body["name"]
        assert_equal 10, body["duration_days"]
        assert_equal "08:00", body["schedule_start_time"]
        assert_equal [1, 2, 3, 4, 5], body["working_days"]

        # Reusable configuration is copied.
        assert_equal 2_500, config["hourly_rate_cents"]
        assert_equal 8, config["hours_per_day"]
        assert_equal 10, config["days"]
        assert_equal job.skill_class, config["skill_class"]
        assert_equal "guaranteed_job_pay", config["pay_basis"]
        assert_equal true, config["potential_full_time"]
        assert_equal "hard_end", config["schedule_flexibility"]
        assert_equal "Bring hand tools", config["notes"]
        assert_equal "EPA 608", config["required_certifications"]
        assert_equal true, config["require_background_check"]
        assert_equal 2, config["minimum_years_experience"]
        assert_equal "Houston", config["city"]

        # Per-posting fields are never copied.
        %w[
          id status scheduled_start_at scheduled_end_at share_token price_cents
          funding_status settlement_status financial_revision agreed_labor_cents
          created_at updated_at go_live_at finished_at
        ].each do |excluded|
          refute config.key?(excluded), "#{excluded} must not be stored on a template"
        end
      end

      test "applying a template recalculates dates from the chosen start date" do
        user, profile = create_company
        job = create_job(profile)

        post "/api/v1/job_templates",
             params: { name: "Reusable HVAC", from_job_id: job.id },
             headers: auth_header_for(user),
             as: :json
        template_id = JSON.parse(response.body)["id"]

        new_start = monday(4)
        post "/api/v1/job_templates/#{template_id}/apply",
             params: { start_date: new_start.to_s },
             headers: auth_header_for(user),
             as: :json

        assert_response :ok
        body = JSON.parse(response.body)

        assert_equal at(new_start, 8), Time.zone.parse(body["scheduled_start_at"])
        # 10 working days Mon-Fri ends on the Friday of the following week.
        assert_equal at(new_start + 11, 17), Time.zone.parse(body["scheduled_end_at"])
        assert_equal 10, body["working_dates"].length
        assert_equal 10, body["job_attributes"]["days"]
        assert_equal 2_500, body["job_attributes"]["hourly_rate_cents"]
        assert_equal 1, JobTemplate.find(template_id).use_count
      end

      test "a non-working start date rolls forward to the next working day" do
        user, profile = create_company
        job = create_job(profile)
        post "/api/v1/job_templates",
             params: { name: "Weekday only", from_job_id: job.id },
             headers: auth_header_for(user),
             as: :json
        template_id = JSON.parse(response.body)["id"]

        saturday = monday(4) + 5
        post "/api/v1/job_templates/#{template_id}/apply",
             params: { start_date: saturday.to_s },
             headers: auth_header_for(user),
             as: :json

        assert_response :ok
        started = Time.zone.parse(JSON.parse(response.body)["scheduled_start_at"])
        assert_equal at(monday(5), 8), started
      end

      test "a job created from an applied template carries the template configuration" do
        user, profile = create_company
        job = create_job(profile)
        post "/api/v1/job_templates",
             params: { name: "Publishable", from_job_id: job.id },
             headers: auth_header_for(user),
             as: :json
        template_id = JSON.parse(response.body)["id"]

        post "/api/v1/job_templates/#{template_id}/apply",
             params: { start_date: monday(6).to_s },
             headers: auth_header_for(user),
             as: :json
        attributes = JSON.parse(response.body)["job_attributes"]

        post "/api/v1/jobs",
             params: attributes.merge("title" => "From template"),
             headers: auth_header_for(user),
             as: :json

        assert_response :created
        created = JSON.parse(response.body)
        assert_equal "From template", created["title"]
        assert_equal 10, created["days"]
        assert_equal true, created["potential_full_time"]
        assert_equal "hard_end", created["schedule_flexibility"]
        assert_equal "guaranteed_job_pay", created["pay_basis"]
        assert_equal at(monday(6), 8), Time.zone.parse(created["scheduled_start_at"])
      end

      test "templates can be renamed, listed and deleted" do
        user, profile = create_company
        job = create_job(profile)
        post "/api/v1/job_templates",
             params: { name: "Original name", from_job_id: job.id },
             headers: auth_header_for(user),
             as: :json
        template_id = JSON.parse(response.body)["id"]

        patch "/api/v1/job_templates/#{template_id}",
              params: { name: "Renamed template" },
              headers: auth_header_for(user),
              as: :json
        assert_response :ok
        assert_equal "Renamed template", JSON.parse(response.body)["name"]

        get "/api/v1/job_templates", headers: auth_header_for(user), as: :json
        assert_response :ok
        assert_equal ["Renamed template"], JSON.parse(response.body).map { |t| t["name"] }

        delete "/api/v1/job_templates/#{template_id}", headers: auth_header_for(user), as: :json
        assert_response :no_content
        assert_nil JobTemplate.find_by(id: template_id)
      end

      test "a template can be created directly from form configuration" do
        user, _profile = create_company

        post "/api/v1/job_templates",
             params: {
               name: "Form template",
               configuration: {
                 hourly_rate_cents: 3_000,
                 hours_per_day: 10,
                 days: 4,
                 skill_class: "Journeyman",
                 potential_full_time: true,
                 schedule_flexibility: "flexible_start",
                 standard_work_days: [1, 2, 3, 4],
                 schedule_start_time: "07:00",
                 status: "open",
                 share_token: "nope"
               }
             },
             headers: auth_header_for(user),
             as: :json

        assert_response :created
        body = JSON.parse(response.body)
        assert_equal 4, body["duration_days"]
        assert_equal "07:00", body["schedule_start_time"]
        assert_equal [1, 2, 3, 4], body["working_days"]
        assert_equal "Journeyman", body["skill_class"]
        refute body["configuration"].key?("status")
        refute body["configuration"].key?("share_token")
      end

      test "a template saved from the create-job form round-trips into a postable job" do
        user, _profile = create_company

        post "/api/v1/job_templates",
             params: {
               name: "Weekly maintenance crew",
               configuration: {
                 title: "Weekly maintenance",
                 description: "Routine checks",
                 notes: nil,
                 trade_type: "HVAC",
                 skill_class: "journeyman",
                 minimum_years_experience: nil,
                 required_certifications: "EPA 608, OSHA 10",
                 require_background_check: true,
                 require_identity_verification: false,
                 require_insurance_verification: false,
                 minimum_verified_references: 0,
                 hourly_rate_cents: 4_500,
                 hours_per_day: 8,
                 days: 5,
                 pay_basis: "actual_hours_worked",
                 potential_full_time: true,
                 schedule_flexibility: "hard_end",
                 start_mode: "hard_start",
                 standard_work_days: [1, 2, 3, 4, 5],
                 standard_day_shifts: {},
                 weekend_work_policy: "prohibited",
                 saturday_work_policy: "unavailable",
                 sunday_work_policy: "unavailable",
                 saturday_multiplier: nil,
                 sunday_multiplier: nil,
                 weekend_requires_company_approval: true,
                 weekend_requires_technician_acceptance: true,
                 premium_combination_rule: "highest_applicable",
                 overtime_enabled: false,
                 daily_overtime_threshold_hours: nil,
                 weekly_overtime_threshold_hours: nil,
                 overtime_multiplier: nil,
                 job_timezone: "UTC",
                 address: "100 Main St",
                 city: "Houston",
                 state: "TX",
                 zip_code: "77002",
                 country: "United States",
                 schedule_start_time: "07:30",
                 schedule_working_day_span: 5
               }
             },
             headers: auth_header_for(user),
             as: :json

        assert_response :created
        template_id = JSON.parse(response.body)["id"]
        assert_equal "07:30", JSON.parse(response.body)["schedule_start_time"]

        post "/api/v1/job_templates/#{template_id}/apply",
             params: { start_date: monday(3).to_s },
             headers: auth_header_for(user),
             as: :json
        assert_response :ok
        applied = JSON.parse(response.body)
        assert_equal at(monday(3), 7) + 30.minutes, Time.zone.parse(applied["scheduled_start_at"])
        assert_equal 5, applied["working_dates"].length

        post "/api/v1/jobs",
             params: applied["job_attributes"],
             headers: auth_header_for(user),
             as: :json

        assert_response :created
        created = JSON.parse(response.body)
        assert_equal "Weekly maintenance", created["title"]
        assert_equal 4_500, created["hourly_rate_cents"]
        assert_equal 5, created["days"]
        assert_equal true, created["potential_full_time"]
        assert_equal "hard_end", created["schedule_flexibility"]
        assert_equal "EPA 608, OSHA 10", created["required_certifications"]
        assert_equal "Houston", created["city"]
        assert_equal at(monday(3), 7) + 30.minutes, Time.zone.parse(created["scheduled_start_at"])
      end

      test "templates are scoped to the owning company" do
        owner, owner_profile = create_company(suffix: "owner#{SecureRandom.hex(3)}")
        other, _other_profile = create_company(suffix: "other#{SecureRandom.hex(3)}")
        job = create_job(owner_profile)

        post "/api/v1/job_templates",
             params: { name: "Private template", from_job_id: job.id },
             headers: auth_header_for(owner),
             as: :json
        template_id = JSON.parse(response.body)["id"]

        get "/api/v1/job_templates", headers: auth_header_for(other), as: :json
        assert_response :ok
        assert_empty JSON.parse(response.body)

        get "/api/v1/job_templates/#{template_id}", headers: auth_header_for(other), as: :json
        assert_response :forbidden

        patch "/api/v1/job_templates/#{template_id}",
              params: { name: "Hijacked" },
              headers: auth_header_for(other),
              as: :json
        assert_response :forbidden

        delete "/api/v1/job_templates/#{template_id}", headers: auth_header_for(other), as: :json
        assert_response :forbidden
        assert_equal "Private template", JobTemplate.find(template_id).name
      end

      test "technicians cannot use the template api" do
        tech = User.create!(
          email: "tpl-tech-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )

        get "/api/v1/job_templates", headers: auth_header_for(tech), as: :json
        assert_response :forbidden

        post "/api/v1/job_templates",
             params: { name: "Nope", configuration: { days: 2 } },
             headers: auth_header_for(tech),
             as: :json
        assert_response :forbidden
      end

      test "a company cannot save another company's job as a template" do
        owner, owner_profile = create_company(suffix: "src#{SecureRandom.hex(3)}")
        other, _other_profile = create_company(suffix: "thief#{SecureRandom.hex(3)}")
        job = create_job(owner_profile)
        assert_equal owner_profile.id, job.company_profile_id
        assert owner.persisted?

        post "/api/v1/job_templates",
             params: { name: "Stolen", from_job_id: job.id },
             headers: auth_header_for(other),
             as: :json

        assert_response :not_found
      end

      test "template names must be unique per company" do
        user, profile = create_company
        job = create_job(profile)

        2.times do
          post "/api/v1/job_templates",
               params: { name: "Duplicate name", from_job_id: job.id },
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :unprocessable_entity
        assert_equal 1, JobTemplate.where(company_profile_id: profile.id).count
      end
    end
  end
end
