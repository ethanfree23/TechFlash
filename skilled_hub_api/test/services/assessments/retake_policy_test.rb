# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  class RetakePolicyTest < ActiveSupport::TestCase
    include AssessmentTestHelper
    include ActiveSupport::Testing::TimeHelpers

    test "retakes are unlimited when no limits are configured" do
      assessment = create_published_assessment!(
        slug: "unlimited",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!

      3.times { complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1) }

      decision = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision

      assert decision.allowed?
      assert_equal "eligible", decision.reason
      assert_equal 3, decision.attempts_used
      assert_nil decision.max_attempts
    end

    test "max_attempts blocks a further attempt once exhausted" do
      assessment = create_published_assessment!(
        slug: "capped",
        max_attempts: 2,
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)
      assert RetakePolicy.new(technician_profile: profile, assessment: assessment).decision.allowed?

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)
      decision = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision

      assert_not decision.allowed?
      assert_equal "max_attempts_reached", decision.reason
      assert_equal 2, decision.attempts_used

      start = StartAttempt.call(technician_profile: profile, assessment: assessment)
      assert_not start.success?
      assert_equal "max_attempts_reached", start.error_code
      assert_equal 2, AssessmentAttempt.where(technician_profile_id: profile.id).count
    end

    test "an expired attempt counts against the attempt allowance" do
      assessment = create_published_assessment!(
        slug: "expired_counts",
        max_attempts: 1,
        time_limit_minutes: 5,
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      travel 6.minutes do
        AttemptExpirer.expire!(attempt.reload)
        decision = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision

        assert_not decision.allowed?
        assert_equal "max_attempts_reached", decision.reason
      end
    end

    test "a waiting period blocks a retake until it elapses" do
      assessment = create_published_assessment!(
        slug: "waiting",
        retake_wait_hours: 24,
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)

      decision = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision
      assert_not decision.allowed?
      assert_equal "waiting_period", decision.reason
      assert decision.available_at.present?

      travel 25.hours do
        later = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision
        assert later.allowed?

        start = StartAttempt.call(technician_profile: profile, assessment: assessment)
        assert start.success?
        assert_equal 2, start.attempt.attempt_number
      end
    end

    test "a live attempt is resumable rather than counted as used" do
      assessment = create_published_assessment!(slug: "resume_not_used", max_attempts: 1)
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      decision = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision

      assert decision.allowed?
      assert_equal "resume", decision.reason
      assert_equal 0, decision.attempts_used
      assert_equal attempt.id, decision.resumable_attempt.id
    end

    test "an attempt is not resumable when the version disallows resuming" do
      assessment = create_published_assessment!(slug: "no_resume", allow_resume: false)
      _user, profile = create_technician!
      StartAttempt.call(technician_profile: profile, assessment: assessment)

      decision = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision

      assert_nil decision.resumable_attempt
    end

    test "attempt numbers increase across retakes" do
      assessment = create_published_assessment!(
        slug: "attempt_numbers",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!

      3.times { complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1) }

      numbers = AssessmentAttempt.where(technician_profile_id: profile.id).order(:attempt_number).pluck(:attempt_number)
      assert_equal [1, 2, 3], numbers
    end

    test "the retake sweeper notifies once a waiting period elapses" do
      assessment = create_published_assessment!(
        slug: "retake_notice",
        retake_wait_hours: 24,
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      user, profile = create_technician!
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)

      travel 25.hours do
        assert_equal 1, RetakeAvailabilitySweeper.call

        notification = AppNotification.where(user_id: user.id, category: "assessment").last
        assert_equal "retake_available", notification.metadata["event"]

        # Running again must not notify a second time.
        assert_equal 0, RetakeAvailabilitySweeper.call
      end
    end

    test "the retake sweeper does nothing when no waiting period is configured" do
      assessment = create_published_assessment!(
        slug: "no_wait_no_notice",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)

      travel 10.days do
        assert_equal 0, RetakeAvailabilitySweeper.call
      end
    end
  end
end
