require "test_helper"

module Schedule
  class AlternateScheduleProposerTest < ActiveSupport::TestCase
    setup do
      @company_user = User.create!(
        email: "propose-co-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :company
      )
      @company_profile = CompanyProfile.create!(
        user: @company_user,
        membership_level: "premium",
        membership_fee_waived: true,
        job_funding_waived: true
      )
      @company_user.update_column(:company_profile_id, @company_profile.id)
      @tech_user = User.create!(
        email: "propose-tech-#{SecureRandom.hex(4)}@example.com",
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

    def build_job(start_at:, end_at:, days:, **overrides)
      Job.create!(
        {
          company_profile: @company_profile,
          title: "Proposal job",
          description: "desc",
          status: :open,
          go_live_at: 30.days.ago,
          start_mode: :hard_start,
          scheduled_start_at: start_at,
          scheduled_end_at: end_at,
          hourly_rate_cents: 5_000,
          hours_per_day: 8,
          days: days,
          job_timezone: "UTC",
          standard_work_days: [1, 2, 3, 4, 5]
        }.merge(overrides)
      )
    end

    def claim!(job)
      JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
      job.update!(status: :filled)
      ConflictDetector.reset_commitments_cache!(@tech_profile)
      job
    end

    # Existing commitment: 10 working days starting Monday of week 0 (through Friday week 1).
    def commit_existing!
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(1) + 4, 17), days: 10))
    end

    # Requested job: 10 working days starting Wednesday of week 1, so the first three
    # requested days collide with the existing commitment.
    def requested_job(**overrides)
      build_job(
        start_at: at(monday(1) + 2, 8),
        end_at: at(monday(3) + 1, 17),
        days: 10,
        **overrides
      )
    end

    def propose(job)
      AlternateScheduleProposer.call(technician_profile: @tech_profile, job: job)
    end

    test "flexible start offers a later start with the full requested duration" do
      commit_existing!
      job = requested_job(schedule_flexibility: :flexible_start)

      options = propose(job)
      assert_equal 1, options.length

      option = options.first
      assert_equal :start_after_conflict, option.kind
      assert option.full_duration
      refute option.partial
      assert_equal 10, option.days
      assert_equal 10, option.requested_days
      # First free working day is the Monday after the existing commitment ends.
      assert_equal at(monday(2), 8), option.start_at
      assert_equal at(monday(3) + 4, 17), option.end_at
      assert_equal 10, option.working_dates.length
    end

    test "hard end offers the remaining requested days and keeps the company end date" do
      commit_existing!
      job = requested_job(schedule_flexibility: :hard_end)

      partial = propose(job).find { |o| o.kind == :keep_original_end }
      assert_not_nil partial

      refute partial.full_duration
      assert partial.partial
      # Requested Wed(w1)..Tue(w3) is 10 working days; the first 3 collide.
      assert_equal 7, partial.days
      assert_equal 10, partial.requested_days
      assert_equal at(monday(2), 8), partial.start_at
      assert_equal job.scheduled_end_at, partial.end_at
      assert_equal 3, partial.unavailable_dates.length
      assert_equal [monday(1) + 2, monday(1) + 3, monday(1) + 4], partial.unavailable_dates.sort
    end

    test "hard end also offers the full duration when the shifted window still fits" do
      commit_existing!
      # End date far enough out that the full 10 days fits after the conflict.
      job = requested_job(
        schedule_flexibility: :hard_end,
        end_at: at(monday(5) + 4, 17),
        hard_deadline_at: at(monday(5) + 4, 17)
      )

      kinds = propose(job).map(&:kind)
      assert_includes kinds, :start_after_conflict
      assert_includes kinds, :keep_original_end
    end

    test "hard end drops the full duration option when it would run past the deadline" do
      commit_existing!
      job = requested_job(
        schedule_flexibility: :hard_end,
        hard_deadline_at: at(monday(3) + 1, 17)
      )

      kinds = propose(job).map(&:kind)
      refute_includes kinds, :start_after_conflict
      assert_includes kinds, :keep_original_end
    end

    test "no options when there is no conflict" do
      job = requested_job
      assert_empty propose(job)
    end

    test "flexible start skips past a second commitment to find a free window" do
      commit_existing!
      # A further commitment occupying weeks 2 and 3.
      claim!(build_job(start_at: at(monday(2), 8), end_at: at(monday(3) + 4, 17), days: 10))
      job = requested_job(schedule_flexibility: :flexible_start)

      option = propose(job).first
      assert_not_nil option
      assert_equal :start_after_conflict, option.kind
      assert_equal 10, option.days
      assert_equal at(monday(4), 8), option.start_at
    end

    test "a fully overlapped hard end job yields no partial option" do
      commit_existing!
      # Requested window sits entirely inside the existing commitment.
      job = build_job(
        start_at: at(monday(0), 8),
        end_at: at(monday(0) + 4, 17),
        days: 5,
        schedule_flexibility: :hard_end,
        hard_deadline_at: at(monday(0) + 4, 17)
      )

      assert_empty propose(job), "no valid way to work this job means unavailable, not negotiable"
    end

    test "weekend-only requested job proposes around a weekend commitment" do
      committed = claim!(build_job(
                           start_at: at(monday(0) + 5, 8),
                           end_at: at(monday(0) + 6, 17),
                           days: 2,
                           standard_work_days: [6, 7],
                           weekend_work_policy: :required,
                           saturday_work_policy: :normal_rate,
                           sunday_work_policy: :normal_rate
                         ))
      assert committed.persisted?

      job = build_job(
        start_at: at(monday(0) + 5, 8),
        end_at: at(monday(1) + 6, 17),
        days: 4,
        standard_work_days: [6, 7],
        weekend_work_policy: :required,
        saturday_work_policy: :normal_rate,
        sunday_work_policy: :normal_rate,
        schedule_flexibility: :flexible_start
      )

      option = propose(job).first
      assert_not_nil option
      assert_equal 4, option.days
      # Next free weekend day after the commitment is the following Saturday.
      assert_equal at(monday(1) + 5, 8), option.start_at
      assert option.working_dates.all? { |d| [6, 7].include?(d.cwday) }
    end

    test "classifier reports schedule_conflict when an alternate schedule exists" do
      commit_existing!
      job = requested_job(schedule_flexibility: :flexible_start)

      result = JobAvailabilityClassifier.call(job: job, technician_profile: @tech_profile)
      assert result.schedule_conflict?
      assert_equal 1, result.options.length
    end

    test "classifier reports unavailable when nothing fits" do
      commit_existing!
      job = build_job(
        start_at: at(monday(0), 8),
        end_at: at(monday(0) + 4, 17),
        days: 5,
        schedule_flexibility: :hard_end,
        hard_deadline_at: at(monday(0) + 4, 17)
      )

      result = JobAvailabilityClassifier.call(job: job, technician_profile: @tech_profile)
      assert result.unavailable?
      assert_equal "no_alternate_schedule_fits", result.reason
    end

    test "classifier reports available with no commitments" do
      job = requested_job
      assert JobAvailabilityClassifier.call(job: job, technician_profile: @tech_profile).available?
    end

    test "classifier payload carries dates so the client never calculates them" do
      commit_existing!
      job = requested_job(schedule_flexibility: :hard_end)

      payload = JobAvailabilityClassifier.payload(job: job, technician_profile: @tech_profile)
      assert_equal "schedule_conflict", payload[:classification]
      assert_equal job.scheduled_start_at, payload[:requested_start_at]
      assert_equal 10, payload[:requested_days]
      assert_equal at(monday(1) + 4, 17), payload[:committed_through_at]
      assert payload[:conflicting_dates].all? { |d| d.is_a?(String) }
      option = payload[:options].find { |o| o[:kind] == "keep_original_end" }
      assert_equal 7, option[:days]
      assert_equal 10, option[:requested_days]
    end
  end
end
