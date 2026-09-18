# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  # The assessment feature is additive: taking one strengthens a profile, but
  # skipping one must never lock a technician out of TechFlash.
  class ProfileContributionTest < ActiveSupport::TestCase
    include AssessmentTestHelper

    test "not taking an assessment does not change job-access completeness" do
      assessment = create_published_assessment!(
        slug: "gating_check",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!

      before = MembershipPolicy.technician_profile_completeness_percent(profile)
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)
      after = MembershipPolicy.technician_profile_completeness_percent(profile.reload)

      assert_equal before, after,
                   "assessment completion must not move the percentage that gates job access"
    end

    test "additional job access eligibility is unaffected by assessment state" do
      assessment = create_published_assessment!(
        slug: "job_access",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!
      rule = { "min_profile_completeness_percent" => 80 }

      before = MembershipPolicy.technician_additional_access_eligible?(technician_profile: profile, rule: rule)
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 0)

      assert_equal before,
                   MembershipPolicy.technician_additional_access_eligible?(
                     technician_profile: profile.reload, rule: rule
                   )
    end

    test "a low score never reduces profile strength below the untaken baseline" do
      assessment = create_published_assessment!(
        slug: "low_score_safe",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!

      baseline = TechnicianProfileStrength.call(profile)[:percent]
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 0)
      after = TechnicianProfileStrength.call(profile.reload)[:percent]

      assert after >= baseline, "scoring 0 must not be worse for the technician than not taking it"
    end

    test "completing an assessment increases profile strength" do
      assessment = create_published_assessment!(
        slug: "strength_up",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!

      baseline = TechnicianProfileStrength.call(profile)[:percent]
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 4)
      after = TechnicianProfileStrength.call(profile.reload)

      assert after[:percent] > baseline
      assert_equal false, after[:counts_toward_job_access]
      assert_equal 100, after[:assessment]["score"]
    end

    test "profile strength offers the assessment as an optional next step" do
      create_published_assessment!(slug: "optional_item", title: "HVAC Knowledge Assessment")
      _user, profile = create_technician!

      strength = TechnicianProfileStrength.call(profile)
      step = strength[:next_steps].find { |entry| entry[:key] == "skills_assessment" }

      assert step.present?, "an untaken assessment should appear as a next step"
      assert_equal true, step[:optional], "it must be marked optional, never required"
      assert_match(/HVAC Knowledge Assessment/, step[:label])
    end

    test "a completed assessment drops out of the next steps" do
      assessment = create_published_assessment!(
        slug: "step_cleared",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

      steps = TechnicianProfileStrength.call(profile.reload)[:next_steps]

      assert_nil steps.find { |entry| entry[:key] == "skills_assessment" }
      assert steps.none? { |entry| entry[:optional] && entry[:key] == "skills_assessment" }
    end

    test "the contribution summarises the technician's strongest result" do
      hvac = create_published_assessment!(
        slug: "contribution_hvac", title: "HVAC Knowledge Assessment", trade_type: "HVAC Technician",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      plumbing = create_published_assessment!(
        slug: "contribution_plumbing", title: "Plumbing Knowledge Assessment", trade_type: "Plumber",
        categories: { "fixtures" => { name: "Fixtures", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!(trade_type: "HVAC Technician")

      complete_attempt!(technician_profile: profile, assessment: plumbing, correct_count: 4)
      complete_attempt!(technician_profile: profile, assessment: hvac, correct_count: 2)

      contribution = ProfileContribution.call(technician_profile: profile).as_json

      assert_equal "completed", contribution["state"]
      assert_equal "HVAC Knowledge Assessment", contribution["assessment_title"],
                   "the technician's own trade result is the one worth surfacing"
      assert_equal 50, contribution["score"]
      assert_equal false, contribution["counts_toward_job_access"]
      assert_equal 15, contribution["earned_strength_percent"]
    end

    test "an in-progress attempt is reported as in progress with no score" do
      assessment = create_published_assessment!(slug: "contribution_in_progress")
      _user, profile = create_technician!
      StartAttempt.call(technician_profile: profile, assessment: assessment)

      contribution = ProfileContribution.call(technician_profile: profile).as_json

      assert_equal "in_progress", contribution["state"]
      assert_nil contribution["score"]
      assert_equal 0, contribution["earned_strength_percent"]
      assert_equal 15, contribution["available_strength_percent"],
                   "an unfinished attempt still has strength left to earn"
    end

    test "the contribution is inert when no assessment is published" do
      _user, profile = create_technician!

      contribution = ProfileContribution.call(technician_profile: profile).as_json

      assert_equal 0, contribution["available_strength_percent"],
                   "no strength may be withheld for an assessment that does not exist yet"
      assert_equal 0, contribution["earned_strength_percent"]
      assert_nil contribution["recommended_assessment_slug"]
      assert_nil TechnicianProfileStrength.call(profile)[:next_steps]
                                          .find { |entry| entry[:key] == "skills_assessment" }
    end

    test "profile strength never exceeds 100" do
      assessment = create_published_assessment!(
        slug: "strength_ceiling",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      user, profile = create_technician!
      profile.update!(
        skill_class: "Journeyman", experience_years: 8, bio: "Twenty years in the trade.",
        specialties: ["Ductwork"], state: "TX", zip_code: "77002"
      )
      user.update!(first_name: "Tess", last_name: "Tech")
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

      strength = TechnicianProfileStrength.call(profile.reload)

      assert strength[:percent] <= 100
      assert strength[:percent].positive?
    end

    test "the technician profile endpoint reports strength without gating" do
      assessment = create_published_assessment!(
        slug: "profile_endpoint",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

      strength = TechnicianProfileStrength.call(profile.reload)

      assert_equal false, strength[:counts_toward_job_access]
      assert_equal false, strength[:assessment]["counts_toward_job_access"]
    end
  end
end
