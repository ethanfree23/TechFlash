# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  class QuestionSelectorTest < ActiveSupport::TestCase
    include AssessmentTestHelper

    test "draws exactly the blueprint count from each category" do
      assessment = create_published_assessment!(
        slug: "blueprint_draw",
        categories: {
          "safety" => { name: "Safety", blueprint: 3, bank: 10 },
          "electrical" => { name: "Electrical", blueprint: 2, bank: 8 },
          "diagnostics" => { name: "Diagnostics", blueprint: 4, bank: 12 }
        }
      )
      version = assessment.live_version

      selections = QuestionSelector.new(version: version).select

      assert_equal 9, selections.size
      distribution = selections.group_by { |selection| selection.question.assessment_category.slug }
                               .transform_values(&:size)
      assert_equal({ "safety" => 3, "electrical" => 2, "diagnostics" => 4 }, distribution)
    end

    test "draws from a bank larger than the paper without repeating a question" do
      assessment = create_published_assessment!(
        slug: "no_repeats",
        categories: { "safety" => { name: "Safety", blueprint: 5, bank: 20 } }
      )

      selections = QuestionSelector.new(version: assessment.live_version).select
      ids = selections.map { |selection| selection.question.id }

      assert_equal 5, ids.size
      assert_equal ids.uniq, ids
    end

    test "positions are contiguous starting at one" do
      assessment = create_published_assessment!(
        slug: "positions",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 10 } }
      )

      selections = QuestionSelector.new(version: assessment.live_version).select

      assert_equal (1..4).to_a, selections.map(&:position)
    end

    test "the same seed reproduces the same draw and a different seed does not" do
      assessment = create_published_assessment!(
        slug: "seeded",
        categories: { "safety" => { name: "Safety", blueprint: 6, bank: 30 } }
      )
      version = assessment.live_version

      first = QuestionSelector.new(version: version, seed: "seed-alpha").select.map { |s| s.question.id }
      again = QuestionSelector.new(version: version, seed: "seed-alpha").select.map { |s| s.question.id }
      other = QuestionSelector.new(version: version, seed: "seed-beta").select.map { |s| s.question.id }

      assert_equal first, again
      assert_not_equal first, other
    end

    test "randomization actually varies the selection across seeds" do
      assessment = create_published_assessment!(
        slug: "varies",
        categories: { "safety" => { name: "Safety", blueprint: 5, bank: 40 } }
      )
      version = assessment.live_version

      draws = 12.times.map do |n|
        QuestionSelector.new(version: version, seed: "seed-#{n}").select.map { |s| s.question.id }.sort
      end

      assert_operator draws.uniq.size, :>, 1, "expected different papers across seeds"
    end

    test "answer choice order is shuffled when configured and stable per seed" do
      assessment = create_published_assessment!(
        slug: "choice_shuffle",
        categories: { "safety" => { name: "Safety", blueprint: 8, bank: 12 } }
      )
      version = assessment.live_version

      selections = QuestionSelector.new(version: version, seed: "choices").select
      canonical = selections.map do |selection|
        selection.question.assessment_answer_choices.ordered.pluck(:id)
      end
      shuffled = selections.map(&:choice_order)

      assert shuffled.zip(canonical).all? { |order, base| order.sort == base.sort },
             "shuffled order must contain the same choice ids"
      assert shuffled.zip(canonical).any? { |order, base| order != base },
             "expected at least one question's choices to be reordered"

      repeat = QuestionSelector.new(version: version, seed: "choices").select.map(&:choice_order)
      assert_equal shuffled, repeat
    end

    test "answer choice order is canonical when randomization is disabled" do
      assessment = create_published_assessment!(
        slug: "no_choice_shuffle",
        categories: { "safety" => { name: "Safety", blueprint: 3, bank: 5 } }
      )
      version = assessment.live_version
      version.update_columns(randomize_answer_choices: false, randomize_questions: false)

      selections = QuestionSelector.new(version: version.reload).select

      selections.each do |selection|
        assert_equal selection.question.assessment_answer_choices.ordered.pluck(:id), selection.choice_order
      end
    end

    test "inactive questions are never drawn" do
      assessment = create_published_assessment!(
        slug: "inactive_excluded",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 6 } }
      )
      version = assessment.live_version
      deactivated_ids = version.assessment_questions.ordered.limit(4).pluck(:id)
      AssessmentQuestion.where(id: deactivated_ids).update_all(active: false)

      selections = QuestionSelector.new(version: version.reload).select

      assert_equal 2, selections.size
      assert_empty selections.map { |selection| selection.question.id } & deactivated_ids
    end

    test "questions with a broken answer key are never drawn" do
      assessment = create_published_assessment!(
        slug: "broken_excluded",
        categories: { "safety" => { name: "Safety", blueprint: 3, bank: 4 } }
      )
      version = assessment.live_version
      broken = version.assessment_questions.ordered.first
      AssessmentAnswerChoice.where(assessment_question_id: broken.id).delete_all

      selections = QuestionSelector.new(version: version.reload).select

      assert_equal 3, selections.size
      assert_not_includes selections.map { |selection| selection.question.id }, broken.id
    end

    test "an insufficient category bank raises rather than serving a short paper" do
      assessment = create_published_assessment!(
        slug: "insufficient",
        categories: { "safety" => { name: "Safety", blueprint: 3, bank: 4 } }
      )
      version = assessment.live_version
      AssessmentQuestion.where(assessment_version_id: version.id).limit(3).update_all(active: false)

      assert_raises(QuestionSelector::InsufficientQuestions) do
        QuestionSelector.new(version: version.reload).select
      end
    end

    test "an attempt persists its drawn paper and never re-randomizes it" do
      assessment = create_published_assessment!(
        slug: "persisted_paper",
        categories: { "safety" => { name: "Safety", blueprint: 5, bank: 30 } }
      )
      _user, profile = create_technician!

      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      original = attempt.assessment_attempt_questions.ordered.pluck(:assessment_question_id, :position, :choice_order)

      5.times do
        resumed = StartAttempt.call(technician_profile: profile, assessment: assessment)
        assert resumed.resumed?
        assert_equal attempt.id, resumed.attempt.id
      end

      assert_equal original,
                   attempt.reload.assessment_attempt_questions.ordered.pluck(:assessment_question_id, :position, :choice_order)
    end
  end
end
