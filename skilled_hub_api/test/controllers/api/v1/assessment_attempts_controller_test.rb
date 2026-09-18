# frozen_string_literal: true

require "test_helper"
require_relative "../../../support/assessment_test_helper"

module Api
  module V1
    class AssessmentAttemptsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper
      include AssessmentTestHelper
      include ActiveSupport::Testing::TimeHelpers

      test "starting an assessment returns the question paper without answers" do
        assessment = create_published_assessment!(
          slug: "start_paper",
          categories: { "safety" => { name: "Safety & Tools", blueprint: 4, bank: 10 } }
        )
        user, = create_technician!

        post "/api/v1/assessments/start_paper/attempts", headers: auth_header_for(user)

        assert_response :created
        body = JSON.parse(response.body)

        assert_equal "in_progress", body["status"]
        assert_equal false, body["resumed"]
        assert_equal 4, body["total_questions"]
        assert_equal 4, body["questions"].size
        assert_equal [1, 2, 3, 4], body["questions"].map { |q| q["position"] }
        assert body["remaining_seconds"].positive?
        assert_equal 30, body["time_limit_minutes"]
        assert_no_answer_key(body)

        question = body["questions"].first
        assert question["prompt"].present?
        assert_equal 4, question["choices"].size
        assert question["choices"].all? { |choice| choice["body"].present? }
        assert_nil question["selected_answer_choice_id"]
        assert_not question.key?("explanation")
      end

      test "starting twice resumes the same attempt with saved answers" do
        assessment = create_published_assessment!(
          slug: "resume_paper",
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 10 } }
        )
        user, = create_technician!

        post "/api/v1/assessments/resume_paper/attempts", headers: auth_header_for(user)
        first = JSON.parse(response.body)
        first_question_ids = first["questions"].map { |question| question["question_id"] }
        target = first["questions"].first

        patch "/api/v1/assessment_attempts/#{first['id']}/answers",
              params: { answers: [{ question_id: target["question_id"], answer_choice_id: target["choices"].first["id"] }] },
              headers: auth_header_for(user),
              as: :json
        assert_response :ok

        post "/api/v1/assessments/resume_paper/attempts", headers: auth_header_for(user)
        second = JSON.parse(response.body)

        assert_response :created
        assert_equal true, second["resumed"]
        assert_equal first["id"], second["id"]
        assert_equal first_question_ids, second["questions"].map { |question| question["question_id"] },
                     "a resumed attempt must show the same questions in the same order"
        assert_equal 1, second["answered_questions"]
        assert_equal target["choices"].first["id"], second["questions"].first["selected_answer_choice_id"]
      end

      test "the choice order is stable across reloads" do
        assessment = create_published_assessment!(
          slug: "stable_choices",
          categories: { "safety" => { name: "Safety", blueprint: 3, bank: 6 } }
        )
        user, = create_technician!

        post "/api/v1/assessments/stable_choices/attempts", headers: auth_header_for(user)
        attempt_id = JSON.parse(response.body)["id"]
        first_order = JSON.parse(response.body)["questions"].map { |q| q["choices"].map { |c| c["id"] } }

        3.times do
          get "/api/v1/assessment_attempts/#{attempt_id}", headers: auth_header_for(user)
          assert_response :ok
          assert_equal first_order, JSON.parse(response.body)["questions"].map { |q| q["choices"].map { |c| c["id"] } }
        end
      end

      test "answers save incrementally and report progress" do
        assessment = create_published_assessment!(
          slug: "incremental",
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, = create_technician!

        post "/api/v1/assessments/incremental/attempts", headers: auth_header_for(user)
        attempt = JSON.parse(response.body)

        attempt["questions"].first(3).each_with_index do |question, index|
          patch "/api/v1/assessment_attempts/#{attempt['id']}/answers",
                params: { answers: [{ question_id: question["question_id"], answer_choice_id: question["choices"].first["id"] }] },
                headers: auth_header_for(user),
                as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal index + 1, body["answered_questions"]
          assert_equal 1, body["saved_count"]
        end

        assert_equal 75, JSON.parse(response.body)["progress_percent"]
      end

      test "a batch of answers can be flushed at once after an interruption" do
        assessment = create_published_assessment!(
          slug: "batch_flush",
          categories: { "safety" => { name: "Safety", blueprint: 5, bank: 10 } }
        )
        user, = create_technician!

        post "/api/v1/assessments/batch_flush/attempts", headers: auth_header_for(user)
        attempt = JSON.parse(response.body)
        payload = attempt["questions"].map do |question|
          { question_id: question["question_id"], answer_choice_id: question["choices"].first["id"] }
        end

        patch "/api/v1/assessment_attempts/#{attempt['id']}/answers",
              params: { answers: payload },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        assert_equal 5, JSON.parse(response.body)["saved_count"]
        assert_equal 5, JSON.parse(response.body)["answered_questions"]
      end

      test "submitting returns the score, bands, category breakdown and disclaimer" do
        assessment = create_published_assessment!(
          slug: "submit_result",
          categories: {
            "safety" => { name: "Safety & Tools", blueprint: 2, bank: 4 },
            "diagnostics" => { name: "Diagnostics", blueprint: 2, bank: 4 }
          }
        )
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
        answer_attempt!(attempt, correct_count: 3)

        post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(user)

        assert_response :ok
        body = JSON.parse(response.body)

        assert_equal "completed", body["status"]
        assert_equal 75, body["score"]
        assert_equal "Advanced Apprentice", body["score_band_label"]
        assert_equal "advanced_apprentice", body["score_band_slug"]
        assert_equal 4, body["total_questions"]
        assert_equal 3, body["correct_answers"]
        assert_equal 2, body["category_results"].size
        assert_match(/not licenses, certifications/, body["disclaimer"])
      end

      test "the technician can review correct answers only after submitting" do
        assessment = create_published_assessment!(
          slug: "review_after",
          categories: { "safety" => { name: "Safety", blueprint: 3, bank: 6 } }
        )
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

        get "/api/v1/assessment_attempts/#{attempt.id}?include=review", headers: auth_header_for(user)
        assert_response :ok
        assert_no_answer_key(JSON.parse(response.body))

        answer_attempt!(attempt.reload, correct_count: 2)
        post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(user)
        assert_response :ok

        get "/api/v1/assessment_attempts/#{attempt.id}?include=review", headers: auth_header_for(user)
        assert_response :ok
        review = JSON.parse(response.body)["review"]

        assert_equal 3, review.size
        assert_equal 2, review.count { |entry| entry["correct"] }
        assert review.all? { |entry| entry["explanation"].present? }
        assert review.all? { |entry| entry["correct_answer_choice_id"].present? }
      end

      test "the review is omitted unless it is asked for" do
        assessment = create_published_assessment!(slug: "review_opt_in")
        user, profile = create_technician!
        attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

        get "/api/v1/assessment_attempts/#{attempt.id}", headers: auth_header_for(user)

        assert_response :ok
        assert_no_answer_key(JSON.parse(response.body))
      end

      test "submitting an unanswered attempt scores zero rather than failing" do
        assessment = create_published_assessment!(
          slug: "submit_blank",
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

        post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(user)

        assert_response :ok
        assert_equal 0, JSON.parse(response.body)["score"]
      end

      test "a duplicate submit is idempotent" do
        assessment = create_published_assessment!(
          slug: "double_submit",
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
        answer_attempt!(attempt, correct_count: 4)

        post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(user)
        assert_response :ok
        first = JSON.parse(response.body)

        post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(user)
        assert_response :ok
        second = JSON.parse(response.body)

        assert_equal first["score"], second["score"]
        assert_equal first["completed_at"], second["completed_at"]
      end

      test "answering after the time limit returns a conflict and the expired attempt" do
        assessment = create_published_assessment!(
          slug: "answer_expired",
          time_limit_minutes: 10,
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
        answer_attempt!(attempt, correct_count: 2, leave_blank: 2)
        question = attempt.assessment_attempt_questions.ordered.last

        travel 11.minutes do
          patch "/api/v1/assessment_attempts/#{attempt.id}/answers",
                params: { answers: [{ question_id: question.assessment_question_id, answer_choice_id: question.presentation_choice_ids.first }] },
                headers: auth_header_for(user),
                as: :json

          assert_response :conflict
          body = JSON.parse(response.body)
          assert_equal "attempt_expired", body["code"]
          assert_equal "expired", body["attempt"]["status"]
          assert_equal 50, body["attempt"]["score"], "an expired attempt is scored on what was answered"
        end
      end

      test "reading an attempt after the time limit shows it expired and scored" do
        assessment = create_published_assessment!(
          slug: "read_expired",
          time_limit_minutes: 10,
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
        answer_attempt!(attempt, correct_count: 1, leave_blank: 3)

        travel 11.minutes do
          get "/api/v1/assessment_attempts/#{attempt.id}", headers: auth_header_for(user)

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "expired", body["status"]
          assert_equal 25, body["score"]
        end
      end

      test "attempt history shows every attempt newest first" do
        assessment = create_published_assessment!(
          slug: "history",
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)
        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 4)

        get "/api/v1/assessment_attempts", headers: auth_header_for(user)

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal 2, body["attempts"].size
        assert_equal [100, 25], body["attempts"].map { |attempt| attempt["score"] }
        assert_equal [2, 1], body["attempts"].map { |attempt| attempt["attempt_number"] }
      end

      test "attempt history can be filtered to one assessment" do
        hvac = create_published_assessment!(slug: "history_hvac", trade_type: "HVAC Technician")
        plumbing = create_published_assessment!(slug: "history_plumbing", trade_type: "Plumber")
        user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: hvac, correct_count: 2)
        complete_attempt!(technician_profile: profile, assessment: plumbing, correct_count: 1)

        get "/api/v1/assessment_attempts?assessment_slug=history_hvac", headers: auth_header_for(user)

        assert_response :ok
        attempts = JSON.parse(response.body)["attempts"]
        assert_equal 1, attempts.size
        assert_equal "history_hvac", attempts.first["assessment_slug"]
      end

      test "a technician cannot read another technician's attempt" do
        assessment = create_published_assessment!(slug: "other_tech_attempt")
        _owner_user, owner_profile = create_technician!
        intruder_user, = create_technician!
        attempt = complete_attempt!(technician_profile: owner_profile, assessment: assessment, correct_count: 2)

        get "/api/v1/assessment_attempts/#{attempt.id}", headers: auth_header_for(intruder_user)

        assert_response :not_found
      end

      test "a technician cannot answer or submit another technician's attempt" do
        assessment = create_published_assessment!(slug: "other_tech_write")
        _owner_user, owner_profile = create_technician!
        intruder_user, = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: owner_profile, assessment: assessment).attempt
        question = attempt.assessment_attempt_questions.ordered.first

        patch "/api/v1/assessment_attempts/#{attempt.id}/answers",
              params: { answers: [{ question_id: question.assessment_question_id, answer_choice_id: question.presentation_choice_ids.first }] },
              headers: auth_header_for(intruder_user),
              as: :json
        assert_response :not_found

        post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(intruder_user)
        assert_response :not_found

        assert attempt.reload.in_progress?
        assert_equal 0, attempt.answered_questions
      end

      test "a company cannot start, read, answer or submit attempts" do
        assessment = create_published_assessment!(slug: "company_denied")
        _tech_user, profile = create_technician!
        company_user, = create_company!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

        post "/api/v1/assessments/company_denied/attempts", headers: auth_header_for(company_user)
        assert_response :forbidden

        get "/api/v1/assessment_attempts", headers: auth_header_for(company_user)
        assert_response :forbidden

        get "/api/v1/assessment_attempts/#{attempt.id}", headers: auth_header_for(company_user)
        assert_response :forbidden

        post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(company_user)
        assert_response :forbidden
      end

      test "attempt endpoints require authentication" do
        assessment = create_published_assessment!(slug: "attempt_anon")
        _user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

        post "/api/v1/assessments/attempt_anon/attempts"
        assert_response :unauthorized

        get "/api/v1/assessment_attempts/#{attempt.id}"
        assert_response :unauthorized

        post "/api/v1/assessment_attempts/#{attempt.id}/submit"
        assert_response :unauthorized
      end

      test "starting beyond the attempt limit is rejected with a reason" do
        assessment = create_published_assessment!(
          slug: "limit_reached",
          max_attempts: 1,
          categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
        )
        user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)

        post "/api/v1/assessments/limit_reached/attempts", headers: auth_header_for(user)

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_equal "max_attempts_reached", body["code"]
        assert_match(/all 1 attempts/, body["error"])
      end

      test "starting during a waiting period is rejected with the available time" do
        assessment = create_published_assessment!(
          slug: "waiting_period",
          retake_wait_hours: 24,
          categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
        )
        user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)

        post "/api/v1/assessments/waiting_period/attempts", headers: auth_header_for(user)

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_equal "waiting_period", body["code"]
        assert body["available_at"].present?
      end

      test "starting an unpublished assessment is rejected" do
        assessment = Assessment.create!(slug: "unpublished_start", title: "Unpublished")
        assessment.assessment_versions.create!(
          version_number: 1, score_bands: Assessments::ScoreBands.starter_template
        )
        user, = create_technician!

        post "/api/v1/assessments/unpublished_start/attempts", headers: auth_header_for(user)

        assert_response :unprocessable_entity
        assert_equal "assessment_unavailable", JSON.parse(response.body)["code"]
      end

      test "an unknown attempt returns not found" do
        user, = create_technician!

        get "/api/v1/assessment_attempts/999999", headers: auth_header_for(user)

        assert_response :not_found
      end

      test "answers with a malformed payload are rejected" do
        assessment = create_published_assessment!(slug: "bad_payload")
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

        patch "/api/v1/assessment_attempts/#{attempt.id}/answers",
              params: { answers: "not-an-array" },
              headers: auth_header_for(user),
              as: :json

        assert_response :unprocessable_entity
        assert_equal "invalid_answers", JSON.parse(response.body)["code"]
      end

      test "a submitted attempt rejects further answers" do
        assessment = create_published_assessment!(slug: "post_submit_write")
        user, profile = create_technician!
        attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)
        question = attempt.assessment_attempt_questions.ordered.first

        patch "/api/v1/assessment_attempts/#{attempt.id}/answers",
              params: { answers: [{ question_id: question.assessment_question_id, answer_choice_id: question.presentation_choice_ids.last }] },
              headers: auth_header_for(user),
              as: :json

        assert_response :conflict
        assert_equal "attempt_not_in_progress", JSON.parse(response.body)["code"]
        assert_equal 100, attempt.reload.score
      end

      private

      def assert_no_answer_key(payload)
        assert_not deep_key?(payload, "correct"), "payload must not expose which choice is correct"
        assert_not deep_key?(payload, "correct_answer_choice_id"), "payload must not expose the answer key"
        assert_not deep_key?(payload, "explanation"), "payload must not expose explanations before submission"
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
end
