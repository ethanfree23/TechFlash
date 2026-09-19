require "test_helper"

module Schedule
  class ConflictDetectorTest < ActiveSupport::TestCase
    setup do
      @company_user = User.create!(
        email: "conflict-co-#{SecureRandom.hex(4)}@example.com",
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
        email: "conflict-tech-#{SecureRandom.hex(4)}@example.com",
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

    # A deterministic Monday well in the future, so weekday maths never depends on today.
    def monday(week_offset = 0)
      base = Date.new(2027, 3, 1)
      base += (1 - base.cwday) % 7
      base + (week_offset * 7)
    end

    def at(date, hour)
      Time.find_zone!("UTC").local(date.year, date.month, date.day, hour, 0, 0)
    end

    def build_job(start_at:, end_at:, days:, work_days: [1, 2, 3, 4, 5], hours_per_day: 8, **overrides)
      Job.create!(
        {
          company_profile: @company_profile,
          title: "Schedule job",
          description: "desc",
          status: :open,
          go_live_at: 30.days.ago,
          start_mode: :hard_start,
          scheduled_start_at: start_at,
          scheduled_end_at: end_at,
          hourly_rate_cents: 5_000,
          hours_per_day: hours_per_day,
          days: days,
          job_timezone: "UTC",
          standard_work_days: work_days
        }.merge(overrides)
      )
    end

    def claim!(job)
      JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
      job.update!(status: :filled)
      ConflictDetector.reset_commitments_cache!(@tech_profile)
      job
    end

    def detect(job)
      ConflictDetector.call(technician_profile: @tech_profile.reload, job: job)
    end

    test "no conflict when the technician has no commitments" do
      job = build_job(start_at: at(monday(0), 8), end_at: at(monday(1) + 4, 17), days: 10)
      result = detect(job)

      refute result.conflict?
      assert_equal 10, result.requested_dates.length
      assert_empty result.conflicting_dates
    end

    test "no conflict when the committed job ends before the new job starts" do
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5))
      job = build_job(start_at: at(monday(1), 8), end_at: at(monday(1) + 4, 17), days: 5)

      refute detect(job).conflict?
    end

    test "conflict ends exactly before the new job begins is not a conflict" do
      # Committed Mon-Fri 08:00-17:00; new job starts the very next working day.
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5))
      job = build_job(start_at: at(monday(0) + 7, 8), end_at: at(monday(1) + 4, 17), days: 5)

      refute detect(job).conflict?
    end

    test "one day overlap is detected and reports only that day" do
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 2, 17), days: 3))
      # New job starts on the committed job's last day.
      job = build_job(start_at: at(monday(0) + 2, 8), end_at: at(monday(0) + 4, 17), days: 3)

      result = detect(job)
      assert result.conflict?
      assert_equal [monday(0) + 2], result.conflicting_dates
      assert_equal 2, result.available_dates.length
    end

    test "full overlap marks every requested day as conflicting" do
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5))
      job = build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5)

      result = detect(job)
      assert result.conflict?
      assert_equal 5, result.conflicting_dates.length
      assert_empty result.available_dates
    end

    test "overlapping date ranges on different working days do not conflict" do
      # Committed Mon-Fri; new job is a weekend-only assignment across the same dates.
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(1) + 4, 17), days: 10))
      weekend_job = build_job(
        start_at: at(monday(0) + 5, 8),
        end_at: at(monday(0) + 6, 17),
        days: 2,
        work_days: [6, 7],
        weekend_work_policy: :required,
        saturday_work_policy: :normal_rate,
        sunday_work_policy: :normal_rate
      )

      result = detect(weekend_job)
      refute result.conflict?, "Mon-Fri and Sat-Sun jobs must not be treated as double-booked"
      assert_equal 2, result.requested_dates.length
    end

    test "different shifts on the same date do not conflict" do
      # Morning shift 06:00-11:00 vs afternoon shift 13:00-18:00 on identical dates.
      claim!(build_job(
               start_at: at(monday(0), 6),
               end_at: at(monday(0) + 4, 11),
               days: 5,
               hours_per_day: 4
             ))
      afternoon = build_job(
        start_at: at(monday(0), 13),
        end_at: at(monday(0) + 4, 18),
        days: 5,
        hours_per_day: 4
      )

      refute detect(afternoon).conflict?
    end

    test "same shift on the same date does conflict" do
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5, hours_per_day: 4))
      overlapping = build_job(start_at: at(monday(0), 11), end_at: at(monday(0) + 4, 16), days: 5, hours_per_day: 4)

      assert detect(overlapping).conflict?
    end

    test "multiple future assignments all contribute to the conflict window" do
      claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5))
      claim!(build_job(start_at: at(monday(1), 8), end_at: at(monday(1) + 4, 17), days: 5))
      job = build_job(start_at: at(monday(0), 8), end_at: at(monday(2) + 4, 17), days: 15)

      result = detect(job)
      assert result.conflict?
      assert_equal 2, result.conflicting_job_ids.length
      assert_equal at(monday(1) + 4, 17), result.committed_through_at
      assert_equal 5, result.available_dates.length
    end

    test "a commitment with no schedule is indeterminate rather than negotiable" do
      unscheduled = build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5)
      claim!(unscheduled)
      unscheduled.update_columns(scheduled_start_at: nil, scheduled_end_at: nil)

      job = build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5)
      result = detect(job)

      assert result.conflict?
      assert result.indeterminate?
    end

    test "the technician's own claim on the job under test is never a conflict" do
      job = build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5)
      claim!(job)

      refute detect(job).conflict?
    end

    test "finished and open assignments are not commitments" do
      finished = build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5)
      JobApplication.create!(job: finished, technician_profile: @tech_profile, status: :accepted)
      finished.update!(status: :finished, finished_at: Time.current)

      job = build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5)
      refute detect(job).conflict?
    end

    test "accepted weekend work on a committed job blocks a weekend job" do
      committed = claim!(build_job(start_at: at(monday(0), 8), end_at: at(monday(0) + 4, 17), days: 5))
      saturday = monday(0) + 5
      committed.weekend_work_requests.create!(
        technician_profile: @tech_profile,
        requested_by_user: @company_user,
        status: :accepted_by_technician,
        requested_date: saturday,
        requested_start_at: at(saturday, 8),
        requested_end_at: at(saturday, 17),
        estimated_hours: 8
      )

      weekend_job = build_job(
        start_at: at(saturday, 8),
        end_at: at(saturday + 1, 17),
        days: 2,
        work_days: [6, 7],
        weekend_work_policy: :required,
        saturday_work_policy: :normal_rate,
        sunday_work_policy: :normal_rate
      )

      result = detect(weekend_job)
      assert result.conflict?
      assert_equal [saturday], result.conflicting_dates
    end

    test "timezone boundaries are evaluated in the job's own timezone" do
      # 23:00 Chicago on Monday is Tuesday in UTC; the working day must follow the job tz.
      chicago_job = build_job(
        start_at: Time.find_zone!("America/Chicago").local(monday(0).year, monday(0).month, monday(0).day, 23, 0, 0),
        end_at: Time.find_zone!("America/Chicago").local(monday(0).year, monday(0).month, monday(0).day + 4, 23, 0, 0) + 9.hours,
        days: 5,
        job_timezone: "America/Chicago"
      )

      dates = WorkingIntervalExpander.for_job(chicago_job).map(&:date)
      assert_equal monday(0), dates.first, "first working date must be Monday in the job timezone"
    end
  end
end
