require "test_helper"

module Api
  module V1
    # End-to-end coverage for the schedule-conflict claim path: a technician sees an
    # overlapping job, claiming it opens an alternate-schedule proposal on the existing
    # counter-offer rails, and company acceptance claims the job on the accepted schedule
    # with the payment recalculated to match.
    class JobScheduleProposalFlowTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      setup do
        @company_user = User.create!(
          email: "sched-co-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        @company_profile = CompanyProfile.create!(
          user: @company_user,
          membership_level: "basic",
          membership_fee_waived: true
        )
        @company_user.update_column(:company_profile_id, @company_profile.id)

        @tech_user = User.create!(
          email: "sched-tech-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        @tech_profile = TechnicianProfile.create!(
          user: @tech_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "premium"
        )
      end

      def monday(week_offset = 0)
        base = Date.new(2027, 3, 1)
        base += (1 - base.cwday) % 7
        base + (week_offset * 7)
      end

      def at(date, hour)
        Time.find_zone!("UTC").local(date.year, date.month, date.day, hour, 0, 0)
      end

      def succeed_stripe!
        success = JobStripeOps::Result.new(status: "succeeded", stripe_id: "obj_#{SecureRandom.hex(4)}")
        JobStripeOps.stub(:create_payment_intent!, success) do
          JobStripeOps.stub(:refund!, success) do
            JobStripeOps.stub(:transfer!, success) { yield }
          end
        end
      end

      def build_job(start_at:, end_at:, days:, rate: 5_000, **overrides)
        Job.create!(
          {
            company_profile: @company_profile,
            title: "Scheduled job",
            description: "desc",
            status: :pending_funding,
            go_live_at: 30.days.ago,
            start_mode: :hard_start,
            scheduled_start_at: start_at,
            scheduled_end_at: end_at,
            hourly_rate_cents: rate,
            hours_per_day: 8,
            days: days,
            job_timezone: "UTC",
            standard_work_days: [1, 2, 3, 4, 5],
            pay_basis: :guaranteed_job_pay
          }.merge(overrides)
        )
      end

      def funded_job(**overrides)
        job = build_job(**overrides)
        succeed_stripe! { JobFundingService.fund_for_publish!(job) }
        job.reload
      end

      # 10 working days, Monday week 0 through Friday week 1.
      def commit_existing!
        job = funded_job(start_at: at(monday(0), 8), end_at: at(monday(1) + 4, 17), days: 10)
        JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
        JobFundingService.snapshot_technician!(job, @tech_profile)
        job.update!(status: :filled)
        Schedule::ConflictDetector.reset_commitments_cache!(@tech_profile)
        job
      end

      # 10 working days starting mid-commitment, so the first three days collide.
      def overlapping_job(**overrides)
        funded_job(
          start_at: at(monday(1) + 2, 8),
          end_at: at(monday(3) + 1, 17),
          days: 10,
          **overrides
        )
      end

      # --- discovery -------------------------------------------------------------

      test "an overlapping job stays visible in discovery and is classified" do
        commit_existing!
        job = overlapping_job

        get "/api/v1/jobs", params: { page: 1 }, headers: auth_header_for(@tech_user)

        assert_response :ok
        listed = JSON.parse(response.body)["jobs"].find { |j| j["id"] == job.id }
        assert_not_nil listed, "an overlapping job must not be hidden from discovery"
        assert_equal "schedule_conflict", listed["schedule_availability"]["classification"]
        assert_equal 1, listed["schedule_availability"]["options"].length
      end

      test "a non-overlapping job is classified available" do
        commit_existing!
        job = funded_job(start_at: at(monday(4), 8), end_at: at(monday(4) + 4, 17), days: 5)

        get "/api/v1/jobs/#{job.id}/schedule_availability", headers: auth_header_for(@tech_user), as: :json

        assert_response :ok
        assert_equal "available", JSON.parse(response.body)["classification"]
      end

      test "Mon-Fri vs Sat-Sun overlapping calendars are available and claim normally" do
        commit_existing!
        weekend = funded_job(
          start_at: at(monday(0) + 5, 8),
          end_at: at(monday(0) + 6, 17),
          days: 2,
          standard_work_days: [6, 7],
          weekend_work_policy: :required,
          saturday_work_policy: :normal_rate,
          sunday_work_policy: :normal_rate
        )

        get "/api/v1/jobs/#{weekend.id}/schedule_availability", headers: auth_header_for(@tech_user), as: :json
        assert_response :ok
        assert_equal "available", JSON.parse(response.body)["classification"]

        get "/api/v1/jobs", params: { page: 1 }, headers: auth_header_for(@tech_user)
        listed = JSON.parse(response.body)["jobs"].find { |j| j["id"] == weekend.id }
        assert_not_nil listed
        assert_equal "available", listed["schedule_availability"]["classification"]

        patch "/api/v1/jobs/#{weekend.id}/claim", headers: auth_header_for(@tech_user), as: :json
        assert_response :ok
        assert weekend.reload.filled?
        refute JSON.parse(response.body)["schedule_conflict"]
        assert_empty weekend.job_counter_offers.where(proposal_kind: :schedule)
      end

      test "the schedule availability endpoint returns pre-computed dates" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)

        get "/api/v1/jobs/#{job.id}/schedule_availability", headers: auth_header_for(@tech_user), as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "schedule_conflict", body["classification"]
        assert_equal at(monday(1) + 4, 17), Time.zone.parse(body["committed_through_at"])
        partial = body["options"].find { |o| o["kind"] == "keep_original_end" }
        assert_equal 7, partial["days"]
        assert_equal 10, partial["requested_days"]
        assert_equal 7, partial["working_dates"].length
        assert_equal 3, partial["unavailable_dates"].length
      end

      # --- claim behaviour -------------------------------------------------------

      test "claiming a non-conflicting job keeps the normal claim behaviour" do
        job = funded_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5)

        patch "/api/v1/jobs/#{job.id}/claim", headers: auth_header_for(@tech_user), as: :json

        assert_response :ok
        job.reload
        assert job.filled?
        assert_equal @tech_profile.id, job.job_applications.find_by(status: :accepted).technician_profile_id
        refute JSON.parse(response.body).key?("schedule_conflict")
      end

      test "claiming a conflicting job returns a conflict with alternate schedules" do
        commit_existing!
        job = overlapping_job

        patch "/api/v1/jobs/#{job.id}/claim", headers: auth_header_for(@tech_user), as: :json

        assert_response :conflict
        body = JSON.parse(response.body)
        assert_equal true, body["schedule_conflict"]
        assert_match(/already have a job scheduled/i, body["error"])

        details = body["schedule_conflict_details"]
        assert_equal "schedule_conflict", details["classification"]
        option = details["options"].first
        assert_equal "start_after_conflict", option["kind"]
        assert_equal 10, option["days"]
        assert_equal true, option["full_duration"]

        # No claim and no double-booking was created.
        refute job.reload.filled?
        assert_empty job.job_applications
      end

      test "an unavailable job cannot be claimed and offers no proposal" do
        commit_existing!
        # Requested window sits entirely inside the commitment with a hard deadline.
        job = funded_job(
          start_at: at(monday(0), 8),
          end_at: at(monday(0) + 4, 17),
          days: 5,
          schedule_flexibility: :hard_end,
          hard_deadline_at: at(monday(0) + 4, 17)
        )

        patch "/api/v1/jobs/#{job.id}/claim", headers: auth_header_for(@tech_user), as: :json

        assert_response :conflict
        body = JSON.parse(response.body)
        assert_empty body["schedule_conflict_details"]["options"]
        assert_match(/no alternate schedule fits/i, body["error"])
      end

      # --- proposal creation -----------------------------------------------------

      test "a schedule proposal stores structured data, not free text" do
        existing = commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :created
        body = JSON.parse(response.body)
        assert_equal "schedule", body["proposal_kind"]
        assert_equal "schedule_conflict", body["proposal_reason"]
        assert_equal "pending_company", body["status"]

        proposal = body["schedule_proposal"]
        assert_equal "keep_original_end", proposal["option"]
        assert_equal at(monday(1) + 2, 8), Time.zone.parse(proposal["original_start_at"])
        assert_equal at(monday(3) + 1, 17), Time.zone.parse(proposal["original_end_at"])
        assert_equal 10, proposal["original_days"]
        assert_equal at(monday(2), 8), Time.zone.parse(proposal["proposed_start_at"])
        assert_equal 7, proposal["proposed_days"]
        assert_equal 7, proposal["proposed_working_dates"].length
        assert_equal 3, proposal["unavailable_working_dates"].length
        assert_equal false, proposal["full_duration_offered"]
        assert_equal true, proposal["partial_duration"]
        assert_equal [existing.id], proposal["conflicting_job_ids"]
        assert_equal at(monday(1) + 4, 17), Time.zone.parse(proposal["committed_through_at"])
        assert_equal false, proposal["stale"]
      end

      test "a full-duration proposal preserves the requested number of working days" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :created
        proposal = JSON.parse(response.body)["schedule_proposal"]
        assert_equal 10, proposal["proposed_days"]
        assert_equal true, proposal["full_duration_offered"]
        assert_equal at(monday(2), 8), Time.zone.parse(proposal["proposed_start_at"])
        assert_equal at(monday(3) + 4, 17), Time.zone.parse(proposal["proposed_end_at"])
      end

      test "an option the job does not allow is rejected" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :unprocessable_entity
        assert_match(/not available/i, JSON.parse(response.body)["error"])
      end

      test "a schedule proposal is rejected when there is no conflict" do
        job = overlapping_job

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :unprocessable_entity
        assert_match(/no longer conflicts/i, JSON.parse(response.body)["error"])
      end

      test "a plain compensation counter offer is unchanged by schedule support" do
        job = overlapping_job

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: {
               proposed_hourly_rate_cents: 5_500,
               proposed_hours_per_day: 8,
               proposed_days: 10,
               proposed_start_at: job.scheduled_start_at.iso8601,
               proposed_end_at: job.scheduled_end_at.iso8601
             },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :created
        body = JSON.parse(response.body)
        assert_equal "compensation", body["proposal_kind"]
        refute body.key?("schedule_proposal")
      end

      # --- company acceptance ----------------------------------------------------

      test "accepting a full-duration proposal claims the job on the accepted schedule" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept",
                headers: auth_header_for(@company_user),
                as: :json
        end

        assert_response :ok
        job.reload
        assert job.filled?
        assert_equal at(monday(2), 8), job.scheduled_start_at
        assert_equal at(monday(3) + 4, 17), job.scheduled_end_at
        assert_equal 10, job.days
        # Full duration means the pay terms are unchanged.
        assert_equal 5_000, job.hourly_rate_cents
        assert_equal 400_000, job.agreed_labor_cents
        assert_equal "accepted", JobCounterOffer.find(offer_id).status
        assert_equal @tech_profile.id, job.job_applications.find_by(status: :accepted).technician_profile_id
      end

      test "a funding-waived company can accept a schedule proposal without a card" do
        @company_profile.update_columns(job_funding_waived: true)
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        patch "/api/v1/counter_offers/#{offer_id}/accept",
              headers: auth_header_for(@company_user),
              as: :json

        assert_response :ok
        job.reload
        assert job.filled?
        assert job.funding_funded?
        assert_equal 10, job.days
        assert_equal 5_000, job.hourly_rate_cents
        assert_equal 0, job.job_payment_transactions.where(transaction_type: %w[counteroffer_top_up counteroffer_refund]).count
      end

      test "accepting a partial proposal recalculates duration hours and payment" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)
        original_required = JobLedger.for(job).company_required_cents
        assert_equal JobMoney.company_charge_cents(400_000, 10), original_required

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept",
                headers: auth_header_for(@company_user),
                as: :json
        end

        assert_response :ok
        job.reload
        assert job.filled?
        # 7 accepted working days rather than the original 10.
        assert_equal 7, job.days
        assert_equal at(monday(2), 8), job.scheduled_start_at
        assert_equal 56, job.estimated_hours.to_i
        assert_equal 280_000, job.agreed_labor_cents

        ledger = JobLedger.for(job)
        assert_equal 280_000, ledger.labor_cents
        assert_equal JobMoney.company_charge_cents(280_000, 10), ledger.company_required_cents
        assert ledger.fully_funded
        # The company is refunded the difference rather than charged for days not worked.
        assert job.job_payment_transactions.counteroffer_refund.status_succeeded.exists?
        assert_equal original_required - ledger.company_required_cents,
                     job.job_payment_transactions.counteroffer_refund.status_succeeded.sum(:amount_cents)
      end

      test "guaranteed job pay guarantees the accepted portion only" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end, pay_basis: :guaranteed_job_pay)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]
        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept", headers: auth_header_for(@company_user), as: :json
        end
        assert_response :ok

        job.reload
        assert job.guaranteed_job_pay?
        job.update!(status: :finished, finished_at: Time.current)
        succeed_stripe! { JobSettlementService.settle!(job) }

        ledger = JobLedger.for(job.reload)
        assert_equal 280_000, ledger.labor_cents, "guaranteed pay must cover the accepted 7 days, not the original 10"
        assert_equal JobMoney.technician_payout_cents(280_000, 10), ledger.technician_net_payout_cents
      end

      test "hours worked only settles on actual hours within the accepted schedule" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end, pay_basis: :actual_hours_worked)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]
        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept", headers: auth_header_for(@company_user), as: :json
        end
        assert_response :ok

        job.reload
        assert_equal 280_000, job.agreed_labor_cents

        worked_date = job.scheduled_start_at.to_date
        entry = job.time_entries.create!(
          technician_profile: @tech_profile,
          submitted_by_user: @tech_user,
          worked_start_at: at(worked_date, 8),
          worked_end_at: at(worked_date, 16),
          worked_on_date: worked_date,
          worked_hours: 40,
          job_timezone: "UTC",
          status: :approved
        )
        entry.create_time_entry_pay_line!(
          job: job,
          base_hourly_rate_cents: 5_000,
          applied_multiplier: 1,
          effective_hourly_rate_cents: 5_000,
          worked_hours: 40,
          gross_pay_cents: 200_000,
          premium_combination_rule: :highest_applicable
        )
        job.update!(status: :finished, finished_at: Time.current)
        succeed_stripe! { JobSettlementService.settle!(job) }

        ledger = JobLedger.for(job.reload)
        assert_equal 200_000, ledger.labor_cents
        assert job.job_payment_transactions.final_hours_refund.status_succeeded.exists?
      end

      test "declining a schedule proposal leaves the job open and unfunded-for-change" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)
        required_before = JobLedger.for(job).company_required_cents

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        patch "/api/v1/counter_offers/#{offer_id}/decline",
              headers: auth_header_for(@company_user),
              as: :json

        assert_response :ok
        assert_equal "declined", JobCounterOffer.find(offer_id).status
        job.reload
        assert job.open?
        assert_equal 10, job.days
        assert_equal required_before, JobLedger.for(job).company_required_cents
        assert_equal 0, job.job_payment_transactions.counteroffer_refund.count
      end

      # --- integrity -------------------------------------------------------------

      test "a proposal is invalidated when the company edits the job schedule" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        patch "/api/v1/jobs/#{job.id}",
              params: { scheduled_end_at: at(monday(4) + 4, 17).iso8601 },
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :ok

        assert_equal "invalidated", JobCounterOffer.find(offer_id).status

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept",
                headers: auth_header_for(@company_user),
                as: :json
        end
        assert_response :unprocessable_entity
        refute job.reload.filled?
      end

      test "a stale proposal cannot be accepted on old terms" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        # Change the terms without going through the controller, so only the accept-time
        # guard can catch it.
        job.update_columns(hours_per_day: 10, updated_at: Time.current)

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept",
                headers: auth_header_for(@company_user),
                as: :json
        end

        assert_response :conflict
        body = JSON.parse(response.body)
        assert_equal true, body["schedule_proposal_stale"]
        assert_equal "invalidated", JobCounterOffer.find(offer_id).status
        refute job.reload.filled?
        assert_equal 0, job.job_payment_transactions.counteroffer_refund.count
      end

      test "accepting after another technician filled the job does not double book" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "keep_original_end" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        other_user = User.create!(
          email: "other-tech-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        other_profile = TechnicianProfile.create!(
          user: other_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "premium"
        )
        JobApplication.create!(job: job, technician_profile: other_profile, status: :accepted)
        job.update!(status: :filled)

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept",
                headers: auth_header_for(@company_user),
                as: :json
        end

        assert_response :unprocessable_entity
        job.reload
        assert_equal 1, job.job_applications.accepted.count
        assert_equal other_profile.id, job.job_applications.accepted.first.technician_profile_id
        # The offer is handed back rather than consumed, and no money moved.
        assert_equal "pending_company", JobCounterOffer.find(offer_id).status
        assert_equal 10, job.days
        assert_equal 0, job.job_payment_transactions.counteroffer_refund.count
      end

      test "a second accept of the same proposal is rejected" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept", headers: auth_header_for(@company_user), as: :json
        end
        assert_response :ok

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept", headers: auth_header_for(@company_user), as: :json
        end
        assert_response :unprocessable_entity
        assert_equal 1, job.reload.job_applications.accepted.count
      end

      test "a proposal survives the existing job being cancelled" do
        existing = commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        # Company denies the technician on the earlier job, freeing their calendar.
        existing.job_applications.find_by(status: :accepted).update!(status: :rejected)
        existing.update!(status: :open)
        Schedule::ConflictDetector.reset_commitments_cache!(@tech_profile)

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept", headers: auth_header_for(@company_user), as: :json
        end

        assert_response :ok
        job.reload
        assert job.filled?
        assert_equal at(monday(2), 8), job.scheduled_start_at
      end

      test "the company can counter a schedule proposal and keep it a schedule negotiation" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        patch "/api/v1/counter_offers/#{offer_id}/counter",
              params: {
                proposed_start_at: at(monday(4), 8).iso8601,
                proposed_end_at: at(monday(5) + 4, 17).iso8601
              },
              headers: auth_header_for(@company_user),
              as: :json

        assert_response :created
        body = JSON.parse(response.body)
        assert_equal "pending_technician", body["status"]
        assert_equal "schedule", body["proposal_kind"]
        proposal = body["schedule_proposal"]
        assert_equal 10, proposal["proposed_days"]
        assert_equal 10, proposal["proposed_working_dates"].length
        assert_equal true, proposal["full_duration_offered"]
        assert_equal "superseded", JobCounterOffer.find(offer_id).status

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{body['id']}/accept", headers: auth_header_for(@tech_user), as: :json
        end
        assert_response :ok
        assert_equal at(monday(4), 8), job.reload.scheduled_start_at
      end

      test "a schedule-only proposal never wipes the agreed pay terms" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start, rate: 7_500)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]

        offer = JobCounterOffer.find(offer_id)
        assert_nil offer.proposed_hourly_rate_cents
        assert_equal 7_500, offer.effective_hourly_rate_cents
        assert_equal 8, offer.effective_hours_per_day

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept", headers: auth_header_for(@company_user), as: :json
        end

        assert_response :ok
        job.reload
        assert_equal 7_500, job.hourly_rate_cents
        assert_equal 7_500, job.agreed_hourly_rate_cents
        assert_equal 8, job.hours_per_day
        assert_equal 600_000, job.agreed_labor_cents
      end

      test "a combined pay and schedule proposal applies both" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: {
               schedule_option: "start_after_conflict",
               proposed_hourly_rate_cents: 6_000,
               proposed_hours_per_day: 8
             },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :created
        body = JSON.parse(response.body)
        assert_equal "compensation_and_schedule", body["proposal_kind"]
        offer_id = body["id"]

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept", headers: auth_header_for(@company_user), as: :json
        end

        assert_response :ok
        job.reload
        assert_equal 6_000, job.hourly_rate_cents
        assert_equal 10, job.days
        assert_equal 480_000, job.agreed_labor_cents
        assert job.job_payment_transactions.counteroffer_top_up.status_succeeded.exists?
      end

      test "a claim that hits a conflict leaves the job terms untouched" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :hard_end)
        before = job.attributes.slice(
          "hourly_rate_cents", "hours_per_day", "days", "scheduled_start_at",
          "scheduled_end_at", "agreed_labor_cents", "financial_revision"
        )

        patch "/api/v1/jobs/#{job.id}/claim", headers: auth_header_for(@tech_user), as: :json
        assert_response :conflict

        after = job.reload.attributes.slice(*before.keys)
        assert_equal before, after
      end

      test "accepting a proposal that still overlaps is a hard failure, not a new proposal" do
        commit_existing!
        job = overlapping_job(schedule_flexibility: :flexible_start)

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: { schedule_option: "start_after_conflict" },
             headers: auth_header_for(@tech_user),
             as: :json
        offer_id = JSON.parse(response.body)["id"]
        proposed_start = Time.zone.parse(JSON.parse(response.body)["schedule_proposal"]["proposed_start_at"])

        # Another assignment now occupies the proposed window, so accepting would double-book.
        blocker = funded_job(
          start_at: proposed_start,
          end_at: proposed_start + 4.days + 9.hours,
          days: 5,
          title: "Later blocker"
        )
        JobApplication.create!(job: blocker, technician_profile: @tech_profile, status: :accepted)
        JobFundingService.snapshot_technician!(blocker, @tech_profile)
        blocker.update!(status: :filled)
        Schedule::ConflictDetector.reset_commitments_cache!(@tech_profile)

        succeed_stripe! do
          patch "/api/v1/counter_offers/#{offer_id}/accept",
                headers: auth_header_for(@company_user),
                as: :json
        end

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        refute body["schedule_conflict"], "company acceptance must not reopen the claim-proposal loop"
        refute job.reload.filled?
        assert_equal "pending_company", JobCounterOffer.find(offer_id).status
        assert_equal 10, job.days
      end
    end
  end
end
