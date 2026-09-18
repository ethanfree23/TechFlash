# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  class ContentImporterTest < ActiveSupport::TestCase
    include AssessmentTestHelper

    test "the documented example imports and publishes" do
      result = ContentImporter.call(ImportSchema.example)

      assert result.success?, result.problems.inspect
      assert result.published
      assessment = result.assessment
      assert_equal "example_trade_knowledge", assessment.slug
      assert_equal "HVAC Technician", assessment.trade_type
      assert assessment.live_version.published?
      assert_equal 2, assessment.live_version.assessment_questions.count
    end

    test "the shipped EXAMPLE.json seed file imports" do
      path = Rails.root.join("db", "assessment_seeds", "EXAMPLE.json")
      assert File.exist?(path), "db/assessment_seeds/EXAMPLE.json should exist as the documented template"

      result = ContentImporter.import_file(path.to_s)

      assert result.success?, result.problems.inspect
    end

    test "EXAMPLE.json is skipped by directory seeding" do
      files = ContentImporter.seed_files(Rails.root.join("db", "assessment_seeds").to_s)

      assert_not_includes files.map { |file| File.basename(file) }, "EXAMPLE.json"
    end

    test "a full import creates the blueprint, bank and answer keys" do
      result = ContentImporter.call(document(bank_size: 6, blueprint: 3))

      assert result.success?, result.problems.inspect
      version = result.assessment.live_version

      assert_equal 3, version.question_count
      assert_equal 1, version.assessment_categories.count
      assert_equal 6, version.assessment_questions.count
      assert_equal 3, version.assessment_categories.first.question_count
      assert version.assessment_questions.includes(:assessment_answer_choices).all?(&:answer_key_complete?)
      assert_equal 6, result.stats[:questions_created]
    end

    test "question_count is derived from the sum of category blueprints" do
      doc = document(bank_size: 4, blueprint: 2)
      doc["categories"] << {
        "slug" => "diagnostics",
        "name" => "Diagnostics",
        "question_count" => 3,
        "questions" => build_questions("diag", 5)
      }

      result = ContentImporter.call(doc)

      assert result.success?, result.problems.inspect
      assert_equal 5, result.assessment.live_version.question_count
    end

    test "re-importing is idempotent and matches questions by external key" do
      doc = document(bank_size: 5, blueprint: 2, publish: false)

      first = ContentImporter.call(doc)
      second = ContentImporter.call(doc)

      assert second.success?, second.problems.inspect
      assert_equal first.version.id, second.version.id
      assert_equal 1, Assessment.where(slug: "import_test").count
      assert_equal 5, second.version.assessment_questions.count
      assert_equal 0, second.stats[:questions_created]
      assert_equal 5, second.stats[:questions_updated]
    end

    test "re-importing updates changed prompts in place" do
      doc = document(bank_size: 2, blueprint: 1, publish: false)
      ContentImporter.call(doc)

      doc["categories"][0]["questions"][0]["prompt"] = "revised prompt"
      result = ContentImporter.call(doc)

      question = result.version.assessment_questions.find_by(external_key: "safety_1")
      assert_equal "revised prompt", question.prompt
      assert_equal 2, result.version.assessment_questions.count
    end

    test "questions dropped from a re-import are deactivated rather than deleted" do
      doc = document(bank_size: 4, blueprint: 1, publish: false)
      ContentImporter.call(doc)

      doc["categories"][0]["questions"] = doc["categories"][0]["questions"].first(2)
      result = ContentImporter.call(doc)

      assert_equal 4, result.version.assessment_questions.count
      assert_equal 2, result.version.assessment_questions.active.count
      assert_equal 2, result.stats[:questions_deactivated]
      assert_not AssessmentQuestion.find_by(external_key: "safety_4").active
    end

    test "answer choices are replaced wholesale so the stored key matches the document" do
      doc = document(bank_size: 1, blueprint: 1, publish: false)
      ContentImporter.call(doc)

      doc["categories"][0]["questions"][0]["choices"] = [
        { "key" => "x", "body" => "new right", "correct" => true },
        { "key" => "y", "body" => "new wrong", "correct" => false }
      ]
      result = ContentImporter.call(doc)
      question = result.version.assessment_questions.find_by(external_key: "safety_1")

      assert_equal %w[new\ right new\ wrong], question.assessment_answer_choices.ordered.pluck(:body)
      assert_equal "new right", question.correct_answer_choice.body
    end

    test "importing into a published version is refused" do
      doc = document(bank_size: 3, blueprint: 1)
      assert ContentImporter.call(doc).success?

      retry_result = ContentImporter.call(doc)

      assert_not retry_result.success?
      assert(retry_result.problems.any? { |problem| problem.include?("immutable") })
    end

    test "on_published new_version clones a published version into a draft" do
      doc = document(bank_size: 3, blueprint: 1)
      first = ContentImporter.call(doc)
      published_version_id = first.version.id

      doc["version"]["on_published"] = "new_version"
      doc["version"]["publish"] = false
      doc["categories"][0]["questions"][0]["prompt"] = "v2 prompt"
      second = ContentImporter.call(doc)

      assert second.success?, second.problems.inspect
      assert_not_equal published_version_id, second.version.id
      assert_equal 2, second.version.version_number
      assert second.version.draft?
      assert_equal "published", AssessmentVersion.find(published_version_id).status
      assert_equal "v2 prompt", second.version.assessment_questions.find_by(external_key: "safety_1").prompt
    end

    test "a dry run validates without writing" do
      result = ContentImporter.call(document(bank_size: 3, blueprint: 1), dry_run: true)

      assert result.success?, result.problems.inspect
      assert_equal 3, result.stats[:questions_created]
      assert_nil Assessment.find_by(slug: "import_test")
    end

    test "a question with no correct answer is rejected before anything is written" do
      doc = document(bank_size: 2, blueprint: 1)
      doc["categories"][0]["questions"][0]["choices"].each { |choice| choice["correct"] = false }

      result = ContentImporter.call(doc)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("exactly one choice must be marked correct") })
      assert_nil Assessment.find_by(slug: "import_test")
    end

    test "a question with two correct answers is rejected" do
      doc = document(bank_size: 2, blueprint: 1)
      doc["categories"][0]["questions"][0]["choices"].each { |choice| choice["correct"] = true }

      result = ContentImporter.call(doc)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("found 4") })
    end

    test "a question with fewer than two choices is rejected" do
      doc = document(bank_size: 2, blueprint: 1)
      doc["categories"][0]["questions"][0]["choices"] = [{ "body" => "only", "correct" => true }]

      result = ContentImporter.call(doc)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("at least two choices") })
    end

    test "required fields are reported together rather than one at a time" do
      result = ContentImporter.call({ "assessment" => {}, "categories" => [] })

      assert_not result.success?
      assert_includes result.problems, "assessment.slug is required"
      assert_includes result.problems, "assessment.title is required"
      assert_includes result.problems, "categories must contain at least one entry"
    end

    test "invalid score bands are rejected" do
      doc = document(bank_size: 2, blueprint: 1)
      doc["version"]["score_bands"] = [{ "slug" => "x", "label" => "X", "min_score" => 0, "max_score" => 50 }]

      result = ContentImporter.call(doc)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("score_bands are invalid") })
    end

    test "an unknown difficulty is rejected" do
      doc = document(bank_size: 2, blueprint: 1)
      doc["categories"][0]["questions"][0]["difficulty"] = "impossible"

      result = ContentImporter.call(doc)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("difficulty must be one of") })
    end

    test "publishing is refused and rolled back when the bank is too small" do
      doc = document(bank_size: 2, blueprint: 5)

      result = ContentImporter.call(doc)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("needs 5 usable questions") })
      assert_nil Assessment.find_by(slug: "import_test")
    end

    test "an unpublished import leaves the assessment untakeable" do
      result = ContentImporter.call(document(bank_size: 3, blueprint: 1, publish: false))

      assert result.success?
      assert_not result.published
      assert_nil result.assessment.live_version
      assert_not result.assessment.takeable?
    end

    test "score bands default to the starter template when omitted" do
      doc = document(bank_size: 2, blueprint: 1, publish: false)
      doc["version"].delete("score_bands")

      result = ContentImporter.call(doc)

      assert_equal ScoreBands.starter_template, result.version.score_bands_config.as_json
    end

    test "an imported assessment can immediately be taken and scored" do
      result = ContentImporter.call(document(bank_size: 8, blueprint: 4))
      _user, profile = create_technician!

      attempt = complete_attempt!(technician_profile: profile, assessment: result.assessment, correct_count: 3)

      assert_equal 4, attempt.total_questions
      assert_equal 75, attempt.score
      assert_equal "Advanced Apprentice", attempt.score_band_label
    end

    test "an assessment with a trade type outside the catalog is rejected" do
      doc = document(bank_size: 2, blueprint: 1)
      doc["assessment"]["trade_type"] = "Astronaut"

      result = ContentImporter.call(doc)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("trade") })
    end

    test "importing a malformed file reports a parse error instead of raising" do
      file = Tempfile.new(["broken", ".json"])
      file.write("{ not json")
      file.flush

      result = ContentImporter.import_file(file.path)

      assert_not result.success?
      assert(result.problems.any? { |problem| problem.include?("not valid JSON") })
    ensure
      file&.close
      file&.unlink
    end

    private

    def document(bank_size:, blueprint:, publish: true)
      {
        "assessment" => {
          "slug" => "import_test",
          "title" => "Import Test Assessment",
          "trade_type" => "HVAC Technician",
          "description" => "A test bank."
        },
        "version" => {
          "version_number" => 1,
          "publish" => publish,
          "time_limit_minutes" => 30,
          "score_bands" => ScoreBands.starter_template
        },
        "categories" => [
          {
            "slug" => "safety",
            "name" => "Safety & Tools",
            "question_count" => blueprint,
            "questions" => build_questions("safety", bank_size)
          }
        ]
      }
    end

    def build_questions(prefix, count)
      (1..count).map do |n|
        {
          "external_key" => "#{prefix}_#{n}",
          "prompt" => "#{prefix} question #{n}?",
          "explanation" => "because #{n}",
          "difficulty" => "medium",
          "choices" => [
            { "key" => "a", "body" => "right #{n}", "correct" => true },
            { "key" => "b", "body" => "wrong #{n} b", "correct" => false },
            { "key" => "c", "body" => "wrong #{n} c", "correct" => false },
            { "key" => "d", "body" => "wrong #{n} d", "correct" => false }
          ]
        }
      end
    end
  end
end
