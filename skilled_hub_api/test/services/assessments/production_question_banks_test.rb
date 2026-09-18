# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  class ProductionQuestionBanksTest < ActionDispatch::IntegrationTest
    include AuthTestHelper
    include AssessmentTestHelper
    include ActiveSupport::Testing::TimeHelpers

    SEED_DIR = Rails.root.join("db", "assessment_seeds")
    BANK_FILES = %w[hvac_knowledge.json plumbing_knowledge.json electrical_knowledge.json].freeze

    EXPECTED_BANKS = {
      "hvac_knowledge.json" => {
        slug: "hvac_knowledge",
        trade_type: "HVAC Technician",
        prefixes: %w[HVAC-SAF HVAC-ELEC HVAC-REF HVAC-EQP HVAC-DIAG],
        categories: %w[
          safety_tools_work_practices
          electrical_fundamentals
          hvac_refrigeration_fundamentals
          equipment_components_installation
          troubleshooting_diagnostics
        ]
      },
      "plumbing_knowledge.json" => {
        slug: "plumbing_knowledge",
        trade_type: "Plumber",
        prefixes: %w[PLMB-SAF PLMB-WTR PLMB-DWV PLMB-FIX PLMB-DIAG],
        categories: %w[
          safety_tools_materials
          water_supply_systems
          drain_waste_vent
          fixtures_installation_fundamentals
          troubleshooting_service
        ]
      },
      "electrical_knowledge.json" => {
        slug: "electrical_knowledge",
        trade_type: "Electrician",
        prefixes: %w[ELEC-SAF ELEC-THY ELEC-CIR ELEC-INS ELEC-DIAG],
        categories: %w[
          safety_tools_work_practices
          electrical_theory
          wiring_circuits_components
          installation_code_fundamentals
          troubleshooting_diagnostics
        ]
      }
    }.freeze

    EXPECTED_BANDS = [
      { "slug" => "foundational", "label" => "Foundational", "min_score" => 0, "max_score" => 39 },
      { "slug" => "developing", "label" => "Developing", "min_score" => 40, "max_score" => 59 },
      { "slug" => "apprentice_knowledge", "label" => "Apprentice Knowledge", "min_score" => 60, "max_score" => 74 },
      { "slug" => "advanced_apprentice_knowledge", "label" => "Advanced Apprentice Knowledge", "min_score" => 75, "max_score" => 89 },
      { "slug" => "strong_trade_knowledge", "label" => "Strong Trade Knowledge", "min_score" => 90, "max_score" => 100 }
    ].freeze

    test "each production bank file exists and matches the documented JSON contract" do
      BANK_FILES.each do |filename|
        path = SEED_DIR.join(filename)
        assert File.exist?(path), "#{filename} should exist"

        document = JSON.parse(File.read(path))
        expected = EXPECTED_BANKS.fetch(filename)

        assert_equal expected[:slug], document.dig("assessment", "slug")
        assert_equal expected[:trade_type], document.dig("assessment", "trade_type")
        assert_equal true, document.dig("assessment", "active")
        assert_equal "best_valid", document.dig("assessment", "public_result_rule")

        version = document.fetch("version")
        assert_equal 1, version["version_number"]
        assert_equal false, version["publish"], "seeds stay unpublished until an admin publishes them"
        assert_equal 30, version["time_limit_minutes"]
        assert_nil version["passing_score"]
        assert_nil version["max_attempts"]
        assert_equal 336, version["retake_wait_hours"]
        assert_equal true, version["randomize_questions"]
        assert_equal true, version["randomize_answer_choices"]
        assert_equal "normalized_percent", version["scoring_strategy"]
        assert_equal EXPECTED_BANDS, version["score_bands"]

        band_labels = version["score_bands"].map { |band| band["label"] }.join(" ")
        %w[Journeyman Master Certified Licensed Expert].each do |banned|
          assert_no_match(/\b#{Regexp.escape(banned)}\b/i, band_labels)
        end

        categories = document.fetch("categories")
        assert_equal expected[:categories], categories.map { |category| category["slug"] }
        assert_equal 40, categories.sum { |category| category["question_count"].to_i }

        questions = categories.flat_map { |category| category.fetch("questions") }
        assert_equal 120, questions.size

        keys = questions.map { |question| question["external_key"] }
        assert_equal 120, keys.uniq.size
        expected[:prefixes].each do |prefix|
          assert_equal 24, keys.count { |key| key.start_with?("#{prefix}-") }, "#{prefix} should have 24 questions"
        end

        questions.each do |question|
          assert question["prompt"].present?, "#{question['external_key']} needs a prompt"
          assert question["explanation"].present?, "#{question['external_key']} needs an explanation"
          assert_includes %w[easy medium hard], question["difficulty"]
          assert_equal true, question["active"]

          choices = question.fetch("choices")
          assert_operator choices.size, :>=, 2
          assert_equal 1, choices.count { |choice| choice["correct"] == true },
                       "#{question['external_key']} needs exactly one correct choice"
          assert choices.all? { |choice| choice["body"].to_s.strip.present? }
        end

        mix = questions.each_with_object(Hash.new(0)) { |question, counts| counts[question["difficulty"]] += 1 }
        assert_equal({ "easy" => 35, "medium" => 60, "hard" => 25 }, mix)
      end
    end

    test "each production bank dry-run validates through the existing importer" do
      BANK_FILES.each do |filename|
        result = ContentImporter.import_file(SEED_DIR.join(filename).to_s, dry_run: true)

        assert result.success?, "#{filename} dry-run failed: #{result.problems.inspect}"
        assert_equal 5, result.stats[:categories]
        assert_equal 120, result.stats[:questions_created]
        assert_equal 480, result.stats[:choices]
        assert_nil Assessment.find_by(slug: EXPECTED_BANKS[filename][:slug])
      end
    end

    test "EXAMPLE.json remains skipped by directory seeding" do
      files = ContentImporter.seed_files(SEED_DIR.to_s)

      assert_not_includes files.map { |file| File.basename(file) }, "EXAMPLE.json"
      BANK_FILES.each do |filename|
        assert_includes files.map { |file| File.basename(file) }, filename
      end
    end

    test "each imported bank can produce a 40-question sitting with category and difficulty mix" do
      BANK_FILES.each do |filename|
        assessment = import_published!(filename)
        version = assessment.live_version

        assert_equal 120, version.assessment_questions.active.count
        assert_equal expected_categories_for(filename), version.assessment_categories.ordered.map(&:slug)
        assert version.assessment_questions.includes(:assessment_answer_choices).all?(&:answer_key_complete?)
        assert version.assessment_questions.all? { |question| question.explanation.present? }
        assert_equal 120, version.assessment_questions.pluck(:external_key).uniq.size
        assert_equal 40, version.question_count
        assert_equal 336, version.retake_wait_hours
        assert_equal EXPECTED_BANDS, version.score_bands_config.as_json

        selections = QuestionSelector.new(version: version, seed: "bank-#{filename}").select
        assert_equal 40, selections.size
        assert_equal 40, selections.map { |selection| selection.question.id }.uniq.size

        by_category = selections.group_by { |selection| selection.question.assessment_category.slug }
        expected_categories_for(filename).each do |slug|
          assert_equal 8, by_category.fetch(slug).size, "#{filename} #{slug} should contribute 8 questions"
        end

        totals = Hash.new(0)
        12.times do |n|
          draw = QuestionSelector.new(version: version, seed: "mix-#{filename}-#{n}").select
          draw.each { |selection| totals[selection.question.difficulty] += 1 }
        end
        averages = totals.transform_values { |count| count / 12.0 }

        assert_in_delta 12, averages.fetch("easy"), 4
        assert_in_delta 20, averages.fetch("medium"), 4
        assert_in_delta 8, averages.fetch("hard"), 4
      end
    end

    test "scoring, category scoring and score bands work on a production sitting" do
      assessment = import_published!("hvac_knowledge.json")
      _user, profile = create_technician!(trade_type: "HVAC Technician")

      started = StartAttempt.call(technician_profile: profile, assessment: assessment)
      assert started.success?, started.error_message
      attempt = started.attempt
      assert_equal 40, attempt.total_questions

      safety_slug = "safety_tools_work_practices"
      answers = attempt.assessment_attempt_questions.ordered.map do |attempt_question|
        correct_id = attempt_question.assessment_question.correct_answer_choice.id
        safety = attempt_question.assessment_category.slug == safety_slug
        {
          "question_id" => attempt_question.assessment_question_id,
          "answer_choice_id" => safety ? correct_id : (attempt_question.presentation_choice_ids - [correct_id]).first
        }
      end
      SaveAnswers.call(attempt: attempt, answers: answers)
      scored = SubmitAttempt.call(attempt: attempt.reload).attempt

      assert_equal 40, scored.total_questions
      assert_equal 8, scored.correct_answers
      assert_equal 20, scored.score
      assert_equal "foundational", scored.score_band_slug
      assert_equal "Foundational", scored.score_band_label

      by_slug = scored.assessment_attempt_category_results.index_by(&:category_slug)
      assert_equal 100, by_slug.fetch(safety_slug).score
      (expected_categories_for("hvac_knowledge.json") - [safety_slug]).each do |slug|
        assert_equal 0, by_slug.fetch(slug).score
      end

      assert_equal "Developing", ScoreBands.new(scored.config_snapshot["score_bands"]).label_for(40)
      assert_equal "Apprentice Knowledge", ScoreBands.new(scored.config_snapshot["score_bands"]).label_for(60)
      assert_equal "Advanced Apprentice Knowledge", ScoreBands.new(scored.config_snapshot["score_bands"]).label_for(75)
      assert_equal "Strong Trade Knowledge", ScoreBands.new(scored.config_snapshot["score_bands"]).label_for(90)
    end

    test "a 14-day retake wait is enforced and then elapses" do
      assessment = import_published!("plumbing_knowledge.json")
      user, profile = create_technician!(trade_type: "Plumber")

      first = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 10)
      assert_equal 25, first.score
      assert_equal "Foundational", first.score_band_label

      blocked = StartAttempt.call(technician_profile: profile, assessment: assessment)
      assert_not blocked.success?
      assert_equal "waiting_period", blocked.error_code
      assert_in_delta 14.days.from_now, blocked.decision.available_at, 2.seconds

      post "/api/v1/assessments/plumbing_knowledge/attempts", headers: auth_header_for(user)
      assert_response :unprocessable_entity
      assert_equal "waiting_period", JSON.parse(response.body)["code"]

      travel 14.days + 1.hour do
        decision = RetakePolicy.new(technician_profile: profile, assessment: assessment).decision
        assert decision.allowed?
        assert_equal "eligible", decision.reason

        allowed = StartAttempt.call(technician_profile: profile, assessment: assessment)
        assert allowed.success?, allowed.error_message
      end
    end

    test "technician and company APIs hide answer keys for a production bank" do
      assessment = import_published!("electrical_knowledge.json")
      tech_user, profile = create_technician!(trade_type: "Electrician")
      company_user, = create_company!

      post "/api/v1/assessments/electrical_knowledge/attempts", headers: auth_header_for(tech_user)
      assert_response :created
      live = JSON.parse(response.body)
      assert_equal 40, live["questions"].size
      assert_no_answer_key(live)
      live["questions"].each do |question|
        assert question["choices"].all? { |choice| choice.key?("body") }
        assert question["choices"].none? { |choice| choice.key?("correct") }
      end

      scored = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 32)
      assert_equal 80, scored.score
      assert_equal "Advanced Apprentice Knowledge", scored.score_band_label

      get "/api/v1/assessment_attempts/#{scored.id}", headers: auth_header_for(tech_user)
      assert_response :ok
      finished = JSON.parse(response.body)
      assert_equal 80, finished["score"]
      assert_nil finished["review"]
      assert_no_match(/correct_answer_choice_id/, response.body)

      get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(company_user)
      assert_response :ok
      profile_payload = JSON.parse(response.body)
      assert_equal 80, profile_payload.dig("assessment_results", "primary", "score")
      assert_equal "Advanced Apprentice Knowledge", profile_payload.dig("assessment_results", "primary", "score_band_label")
      assert_match(/not licenses, certifications/i, profile_payload.dig("assessment_results", "disclaimer"))
      assert_no_match(/"correct"/, response.body)
      assert_no_match(/correct_answer_choice_id/, response.body)
      assert_no_match(/"explanation"/, response.body)
      assert_no_match(/\bJourneyman\b/, response.body)
      assert_no_match(/\bMaster\b/, response.body)

      get "/api/v1/technicians", headers: auth_header_for(company_user)
      assert_response :ok
      card = JSON.parse(response.body).find { |entry| entry["id"] == profile.id }
      assert_equal 80, card.dig("assessment_results", "primary", "score")
      assert_no_match(/"correct"/, response.body)
      assert_no_match(/correct_answer_choice_id/, response.body)

      get "/api/v1/technicians/#{profile.id}/assessment_results", headers: auth_header_for(company_user)
      assert_response :ok
      assert_no_match(/"correct"/, response.body)
      assert_no_match(/correct_answer_choice_id/, response.body)
      assert_no_match(/"explanation"/, response.body)
    end

    private

    def import_published!(filename)
      document = JSON.parse(File.read(SEED_DIR.join(filename)))
      document["version"]["publish"] = true
      result = ContentImporter.call(document)
      assert result.success?, "#{filename} import failed: #{result.problems.inspect}"
      assert result.published
      result.assessment.reload
    end

    def expected_categories_for(filename)
      EXPECTED_BANKS.fetch(filename).fetch(:categories)
    end

    def assert_no_answer_key(payload)
      assert_not deep_key?(payload, "correct")
      assert_not deep_key?(payload, "correct_answer_choice_id")
      assert_not deep_key?(payload, "explanation")
    end

    def deep_key?(node, key)
      case node
      when Hash
        return true if node.key?(key)

        node.values.any? { |value| deep_key?(value, key) }
      when Array
        node.any? { |value| deep_key?(value, key) }
      else
        false
      end
    end
  end
end
