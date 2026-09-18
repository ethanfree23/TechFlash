# frozen_string_literal: true

require "test_helper"
require_relative "../support/assessment_test_helper"

class AssessmentVersionTest < ActiveSupport::TestCase
  include AssessmentTestHelper

  test "draft version content is editable" do
    assessment = create_draft_assessment!
    version = assessment.latest_version
    question = version.assessment_questions.first

    assert version.editable?
    assert question.update(prompt: "edited prompt")
    assert_equal "edited prompt", question.reload.prompt
  end

  test "publishing freezes version configuration" do
    assessment = create_published_assessment!(slug: "freeze_config")
    version = assessment.live_version

    version.time_limit_minutes = 999

    assert_not version.save
    assert_match(/immutable/, version.errors.full_messages.join)
    assert_equal 30, version.reload.time_limit_minutes
  end

  test "published version status may still change to retired" do
    assessment = create_published_assessment!(slug: "retire_ok")
    version = assessment.live_version

    assert Assessments::VersionPublisher.retire!(version).success?
    assert version.reload.retired?
  end

  test "questions belonging to a published version cannot be updated" do
    assessment = create_published_assessment!(slug: "freeze_questions")
    question = assessment.live_version.assessment_questions.first
    original = question.prompt

    question.prompt = "tampered"

    assert_not question.save
    assert_equal original, question.reload.prompt
  end

  test "answer choices belonging to a published version cannot be updated" do
    assessment = create_published_assessment!(slug: "freeze_choices")
    choice = assessment.live_version.assessment_questions.first.assessment_answer_choices.first
    original = choice.correct

    choice.correct = !original

    assert_not choice.save
    assert_equal original, choice.reload.correct
  end

  test "categories belonging to a published version cannot be destroyed" do
    assessment = create_published_assessment!(slug: "freeze_categories")
    category = assessment.live_version.assessment_categories.first

    assert_not category.destroy
    assert AssessmentCategory.exists?(category.id)
  end

  test "publishing a second version retires the first and leaves it intact" do
    assessment = create_published_assessment!(slug: "two_versions")
    v1 = assessment.live_version
    v1_question_ids = v1.assessment_questions.order(:id).pluck(:id)

    v2 = Assessments::VersionPublisher.clone_to_draft(v1).version
    assert_equal 2, v2.version_number
    assert v2.draft?

    assert Assessments::VersionPublisher.publish!(v2).success?

    assert_equal "retired", v1.reload.status
    assert_equal 2, assessment.reload.live_version.version_number
    assert_equal v1_question_ids, v1.assessment_questions.order(:id).pluck(:id)
  end

  test "cloning copies categories, questions and answer keys" do
    assessment = create_published_assessment!(
      slug: "clone_content",
      categories: {
        "safety" => { name: "Safety", blueprint: 1, bank: 3 },
        "diagnostics" => { name: "Diagnostics", blueprint: 1, bank: 2 }
      }
    )
    source = assessment.live_version

    clone = Assessments::VersionPublisher.clone_to_draft(source).version

    assert_equal source.assessment_categories.count, clone.assessment_categories.count
    assert_equal source.assessment_questions.count, clone.assessment_questions.count
    assert_equal source.assessment_answer_choices.count, clone.assessment_answer_choices.count
    assert_equal(
      source.assessment_questions.order(:external_key).pluck(:external_key),
      clone.assessment_questions.order(:external_key).pluck(:external_key)
    )
    assert clone.assessment_questions.includes(:assessment_answer_choices).all?(&:answer_key_complete?)
  end

  test "publication is blocked when a category bank is smaller than its blueprint" do
    assessment = Assessment.create!(slug: "short_bank", title: "Short Bank")
    version = assessment.assessment_versions.create!(
      version_number: 1,
      score_bands: Assessments::ScoreBands.starter_template
    )
    category = version.assessment_categories.create!(slug: "safety", name: "Safety", question_count: 5)
    create_question!(version: version, category: category, key: "only_one")

    result = Assessments::VersionPublisher.publish!(version.reload)

    assert_not result.success?
    assert_equal "version_not_publishable", result.error_code
    assert(result.problems.any? { |problem| problem.include?("needs 5 usable questions") })
    assert version.reload.draft?
  end

  test "publication is blocked when a question has no single correct answer" do
    assessment = Assessment.create!(slug: "broken_key", title: "Broken Key")
    version = assessment.assessment_versions.create!(
      version_number: 1,
      score_bands: Assessments::ScoreBands.starter_template
    )
    category = version.assessment_categories.create!(slug: "safety", name: "Safety", question_count: 1)
    question = version.assessment_questions.create!(
      assessment_category: category, prompt: "no key?", external_key: "broken"
    )
    question.assessment_answer_choices.create!(body: "a", correct: false, position: 0)
    question.assessment_answer_choices.create!(body: "b", correct: false, position: 1)

    result = Assessments::VersionPublisher.publish!(version.reload)

    assert_not result.success?
    assert(result.problems.any? { |problem| problem.include?("exactly one correct answer") })
  end

  test "version question_count is derived from the category blueprint on publish" do
    assessment = create_published_assessment!(
      slug: "blueprint_total",
      categories: {
        "a" => { name: "A", blueprint: 3, bank: 6 },
        "b" => { name: "B", blueprint: 4, bank: 8 }
      }
    )

    assert_equal 7, assessment.live_version.question_count
  end

  test "a version with invalid score bands is rejected" do
    assessment = Assessment.create!(slug: "bad_bands", title: "Bad Bands")
    version = assessment.assessment_versions.new(
      version_number: 1,
      score_bands: [{ "slug" => "low", "label" => "Low", "min_score" => 0, "max_score" => 50 }]
    )

    assert_not version.valid?
    assert_match(/cover through 100/, version.errors.full_messages.join)
  end

  test "assessment slug must be a stable lowercase identifier" do
    assert_not Assessment.new(slug: "Bad Slug", title: "X").valid?
    assert Assessment.new(slug: "good_slug_1", title: "X").valid?
  end

  test "assessment trade_type must be a TradeCatalog label" do
    assert_not Assessment.new(slug: "bad_trade", title: "X", trade_type: "Astronaut").valid?

    assessment = Assessment.new(slug: "legacy_trade", title: "X", trade_type: "hvac")
    assert assessment.valid?
    assert_equal "HVAC Technician", assessment.trade_type
  end

  private

  def create_draft_assessment!
    assessment = Assessment.create!(slug: "draft_only", title: "Draft Only")
    version = assessment.assessment_versions.create!(
      version_number: 1,
      score_bands: Assessments::ScoreBands.starter_template
    )
    category = version.assessment_categories.create!(slug: "safety", name: "Safety", question_count: 1)
    create_question!(version: version, category: category, key: "draft_q1")
    assessment.reload
  end
end
