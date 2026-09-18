# frozen_string_literal: true

require "test_helper"
require_relative "../../../../support/assessment_test_helper"

module Api
  module V1
    module Admin
      class AssessmentManagementTest < ActionDispatch::IntegrationTest
        include AuthTestHelper
        include AssessmentTestHelper

        setup do
          @admin = create_assessment_admin!
          @headers = auth_header_for(@admin)
        end

        # --- Authoring an assessment from nothing ----------------------------

        test "an admin can author, populate and publish an assessment end to end" do
          post "/api/v1/admin/assessments",
               params: {
                 slug: "authored_trade",
                 title: "Authored Trade Knowledge Assessment",
                 trade_type: "Plumber",
                 description: "Covers the fundamentals."
               },
               headers: @headers,
               as: :json

          assert_response :created
          created = JSON.parse(response.body)
          assert_equal "authored_trade", created["slug"]
          assert_equal 1, created["versions"].size, "creating an assessment should open a draft version"
          version_id = created["versions"].first["id"]
          assert_equal "draft", created["versions"].first["status"]

          patch "/api/v1/admin/assessment_versions/#{version_id}",
                params: { time_limit_minutes: 25, passing_score: 70, instructions: "Read carefully." },
                headers: @headers,
                as: :json
          assert_response :ok
          assert_equal 25, JSON.parse(response.body)["time_limit_minutes"]

          post "/api/v1/admin/assessment_versions/#{version_id}/categories",
               params: { slug: "fixtures", name: "Fixtures", question_count: 2 },
               headers: @headers,
               as: :json
          assert_response :created
          category_id = JSON.parse(response.body)["id"]

          3.times do |n|
            post "/api/v1/admin/assessment_versions/#{version_id}/questions",
                 params: {
                   assessment_category_id: category_id,
                   prompt: "Fixture question #{n + 1}?",
                   explanation: "Because #{n + 1}.",
                   difficulty: "medium",
                   choices: [
                     { body: "right", correct: true },
                     { body: "wrong a", correct: false },
                     { body: "wrong b", correct: false }
                   ]
                 },
                 headers: @headers,
                 as: :json
            assert_response :created
          end

          post "/api/v1/admin/assessment_versions/#{version_id}/publish", headers: @headers
          assert_response :ok
          published = JSON.parse(response.body)
          assert_equal "published", published["status"]
          assert_equal 2, published["question_count"]

          # The published assessment is immediately takeable.
          user, = create_technician!(trade_type: "Plumber")
          post "/api/v1/assessments/authored_trade/attempts", headers: auth_header_for(user)
          assert_response :created
          assert_equal 2, JSON.parse(response.body)["questions"].size
        end

        test "publishing is refused while the bank is smaller than the blueprint" do
          assessment = Assessment.create!(slug: "short_bank", title: "Short Bank")
          version = assessment.assessment_versions.create!(
            version_number: 1, score_bands: Assessments::ScoreBands.starter_template
          )
          category = version.assessment_categories.create!(slug: "safety", name: "Safety", question_count: 5)
          create_question!(version: version, category: category, key: "safety_1")

          post "/api/v1/admin/assessment_versions/#{version.id}/publish", headers: @headers

          assert_response :unprocessable_entity
          body = JSON.parse(response.body)
          assert_equal "version_not_publishable", body["code"]
          assert(body["problems"].any? { |problem| problem.include?("needs 5 usable questions") })
          assert version.reload.draft?
        end

        test "publishing is refused when a version has no categories" do
          assessment = Assessment.create!(slug: "no_categories", title: "No Categories")
          version = assessment.assessment_versions.create!(
            version_number: 1, score_bands: Assessments::ScoreBands.starter_template
          )

          post "/api/v1/admin/assessment_versions/#{version.id}/publish", headers: @headers

          assert_response :unprocessable_entity
          assert(JSON.parse(response.body)["problems"].any? { |problem| problem.include?("at least one category") })
        end

        test "a question without exactly one correct choice is rejected" do
          version = draft_version_with_category

          post "/api/v1/admin/assessment_versions/#{version[:version].id}/questions",
               params: {
                 assessment_category_id: version[:category].id,
                 prompt: "Ambiguous?",
                 choices: [{ body: "a", correct: true }, { body: "b", correct: true }]
               },
               headers: @headers,
               as: :json

          assert_response :unprocessable_entity
          assert_match(/exactly one/i, JSON.parse(response.body)["errors"].join)
        end

        test "a question with a single choice is rejected" do
          version = draft_version_with_category

          post "/api/v1/admin/assessment_versions/#{version[:version].id}/questions",
               params: {
                 assessment_category_id: version[:category].id,
                 prompt: "Only one option?",
                 choices: [{ body: "a", correct: true }]
               },
               headers: @headers,
               as: :json

          assert_response :unprocessable_entity
          assert_match(/at least two/i, JSON.parse(response.body)["errors"].join)
        end

        # --- Immutability of published content -------------------------------

        test "a published version cannot be edited" do
          assessment = create_published_assessment!(slug: "locked_version")
          version = assessment.live_version

          patch "/api/v1/admin/assessment_versions/#{version.id}",
                params: { time_limit_minutes: 99 },
                headers: @headers,
                as: :json

          assert_response :unprocessable_entity
          assert_equal "version_immutable", JSON.parse(response.body)["code"]
          assert_equal 30, version.reload.time_limit_minutes
        end

        test "a category in a published version cannot be edited or deleted" do
          assessment = create_published_assessment!(slug: "locked_category")
          category = assessment.live_version.assessment_categories.first

          patch "/api/v1/admin/assessment_categories/#{category.id}",
                params: { name: "Renamed" },
                headers: @headers,
                as: :json
          assert_response :unprocessable_entity
          assert_equal "version_immutable", JSON.parse(response.body)["code"]

          delete "/api/v1/admin/assessment_categories/#{category.id}", headers: @headers
          assert_response :unprocessable_entity

          assert_equal "Safety & Tools", category.reload.name
        end

        test "a question in a published version cannot be edited or deleted" do
          assessment = create_published_assessment!(slug: "locked_question")
          question = assessment.live_version.assessment_questions.first
          original_prompt = question.prompt

          patch "/api/v1/admin/assessment_questions/#{question.id}",
                params: { prompt: "Rewritten?" },
                headers: @headers,
                as: :json
          assert_response :unprocessable_entity
          assert_equal "version_immutable", JSON.parse(response.body)["code"]

          delete "/api/v1/admin/assessment_questions/#{question.id}", headers: @headers
          assert_response :unprocessable_entity

          assert_equal original_prompt, question.reload.prompt
        end

        test "a question cannot be added to a published version" do
          assessment = create_published_assessment!(slug: "locked_add")
          version = assessment.live_version

          post "/api/v1/admin/assessment_versions/#{version.id}/questions",
               params: {
                 assessment_category_id: version.assessment_categories.first.id,
                 prompt: "Sneaky?",
                 choices: [{ body: "a", correct: true }, { body: "b", correct: false }]
               },
               headers: @headers,
               as: :json

          assert_response :unprocessable_entity
          assert_equal "version_immutable", JSON.parse(response.body)["code"]
        end

        test "a published version cannot be deleted" do
          assessment = create_published_assessment!(slug: "locked_delete")
          version = assessment.live_version

          delete "/api/v1/admin/assessment_versions/#{version.id}", headers: @headers

          assert_response :unprocessable_entity
          assert_equal "version_immutable", JSON.parse(response.body)["code"]
          assert AssessmentVersion.exists?(version.id)
        end

        # --- Versioning ------------------------------------------------------

        test "cloning a published version produces an editable draft copy" do
          assessment = create_published_assessment!(
            slug: "clone_flow",
            categories: { "safety" => { name: "Safety & Tools", blueprint: 2, bank: 5 } }
          )
          published = assessment.live_version

          post "/api/v1/admin/assessment_versions/#{published.id}/clone", headers: @headers

          assert_response :created
          draft = JSON.parse(response.body)
          assert_equal 2, draft["version_number"]
          assert_equal "draft", draft["status"]

          clone = AssessmentVersion.find(draft["id"])
          assert_equal 1, clone.assessment_categories.count
          assert_equal 5, clone.assessment_questions.count
          assert_equal published.assessment_questions.count, clone.assessment_questions.count
          assert_not_equal published.assessment_questions.first.id, clone.assessment_questions.first.id

          patch "/api/v1/admin/assessment_versions/#{clone.id}",
                params: { time_limit_minutes: 45 },
                headers: @headers,
                as: :json
          assert_response :ok
          assert_equal 45, clone.reload.time_limit_minutes
          assert_equal 30, published.reload.time_limit_minutes, "the published version must be untouched"
        end

        test "publishing a new version retires the previous one and leaves old attempts intact" do
          assessment = create_published_assessment!(
            slug: "version_rollover",
            categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
          )
          v1 = assessment.live_version
          _user, profile = create_technician!
          old_attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

          post "/api/v1/admin/assessment_versions/#{v1.id}/clone", headers: @headers
          clone_id = JSON.parse(response.body)["id"]

          post "/api/v1/admin/assessment_versions/#{clone_id}/publish", headers: @headers
          assert_response :ok

          assert_equal "retired", v1.reload.status
          assert_equal clone_id, assessment.reload.live_version.id
          assert_equal v1.id, old_attempt.reload.assessment_version_id
          assert_equal 100, old_attempt.score
          assert_equal 2, old_attempt.assessment_attempt_questions.count
        end

        test "retiring the only published version takes the assessment out of the catalog" do
          assessment = create_published_assessment!(slug: "retire_only")
          version = assessment.live_version
          user, = create_technician!

          post "/api/v1/admin/assessment_versions/#{version.id}/retire", headers: @headers
          assert_response :ok

          assert_equal "retired", version.reload.status
          assert_nil assessment.reload.live_version

          get "/api/v1/assessments", headers: auth_header_for(user)
          slugs = JSON.parse(response.body)["assessments"].map { |entry| entry["slug"] }
          assert_not_includes slugs, "retire_only"
        end

        test "an in-progress attempt on a retired version can still be finished" do
          assessment = create_published_assessment!(
            slug: "retire_mid_attempt",
            categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
          )
          user, profile = create_technician!
          attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

          post "/api/v1/admin/assessment_versions/#{assessment.live_version.id}/retire", headers: @headers
          assert_response :ok

          answer_attempt!(attempt.reload, correct_count: 3)
          post "/api/v1/assessment_attempts/#{attempt.id}/submit", headers: auth_header_for(user)

          assert_response :ok
          assert_equal 75, JSON.parse(response.body)["score"]
        end

        test "a draft version can be deleted" do
          assessment = create_published_assessment!(slug: "delete_draft")
          post "/api/v1/admin/assessment_versions/#{assessment.live_version.id}/clone", headers: @headers
          clone_id = JSON.parse(response.body)["id"]

          delete "/api/v1/admin/assessment_versions/#{clone_id}", headers: @headers

          assert_response :no_content
          assert_not AssessmentVersion.exists?(clone_id)
          assert assessment.reload.live_version.present?
        end

        # --- Answer key exposure ---------------------------------------------

        test "the admin question payload includes the answer key" do
          assessment = create_published_assessment!(slug: "admin_key")
          version = assessment.live_version

          get "/api/v1/admin/assessment_versions/#{version.id}/questions", headers: @headers

          assert_response :ok
          question = JSON.parse(response.body)["questions"].first
          assert question["explanation"].present?
          assert_equal 1, question["choices"].count { |choice| choice["correct"] }
          assert_equal "correct", question["choices"].find { |choice| choice["correct"] }["body"]
        end

        test "admin endpoints reject technicians and companies" do
          assessment = create_published_assessment!(slug: "admin_guarded")
          version = assessment.live_version
          tech_user, = create_technician!
          company_user, = create_company!

          [tech_user, company_user].each do |user|
            headers = auth_header_for(user)

            get "/api/v1/admin/assessments", headers: headers
            assert_response :forbidden

            get "/api/v1/admin/assessment_versions/#{version.id}", headers: headers
            assert_response :forbidden

            get "/api/v1/admin/assessment_versions/#{version.id}/questions", headers: headers
            assert_response :forbidden

            post "/api/v1/admin/assessment_versions/#{version.id}/publish", headers: headers
            assert_response :forbidden

            post "/api/v1/admin/assessment_imports",
                 params: { document: Assessments::ImportSchema.example },
                 headers: headers,
                 as: :json
            assert_response :forbidden
          end
        end

        test "admin endpoints require authentication" do
          get "/api/v1/admin/assessments"
          assert_response :unauthorized
        end

        # --- Assessment records ----------------------------------------------

        test "the admin index lists assessments with version and attempt counts" do
          assessment = create_published_assessment!(
            slug: "admin_index",
            categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
          )
          _user, profile = create_technician!
          complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

          get "/api/v1/admin/assessments", headers: @headers

          assert_response :ok
          entry = JSON.parse(response.body)["assessments"].find { |item| item["slug"] == "admin_index" }
          assert_equal 1, entry["versions_count"]
          assert_equal 1, entry["attempts_count"]
          assert_equal 1, entry["completed_attempts_count"]
          assert_equal 1, entry["technicians_with_results_count"]
          assert_equal 1, entry["live_version_number"]
        end

        test "a duplicate slug is rejected" do
          create_published_assessment!(slug: "taken_slug")

          post "/api/v1/admin/assessments",
               params: { slug: "taken_slug", title: "Another" },
               headers: @headers,
               as: :json

          assert_response :unprocessable_entity
          assert_match(/taken/i, JSON.parse(response.body)["errors"].join)
        end

        test "an assessment with attempts cannot be deleted but can be deactivated" do
          assessment = create_published_assessment!(
            slug: "has_attempts",
            categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
          )
          _user, profile = create_technician!
          complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

          delete "/api/v1/admin/assessments/#{assessment.id}", headers: @headers
          assert_response :unprocessable_entity
          assert_equal "assessment_has_attempts", JSON.parse(response.body)["code"]
          assert Assessment.exists?(assessment.id)

          patch "/api/v1/admin/assessments/#{assessment.id}",
                params: { active: false },
                headers: @headers,
                as: :json
          assert_response :ok
          assert_not assessment.reload.active?
        end

        test "an unused assessment can be deleted" do
          assessment = create_published_assessment!(slug: "unused")

          delete "/api/v1/admin/assessments/#{assessment.id}", headers: @headers

          assert_response :no_content
          assert_not Assessment.exists?(assessment.id)
        end

        test "changing the public result rule recomputes published results" do
          assessment = create_published_assessment!(
            slug: "rule_change",
            categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
          )
          _user, profile = create_technician!
          complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 4)
          complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)

          result = TechnicianAssessmentResult.find_by!(
            technician_profile_id: profile.id, assessment_id: assessment.id
          )
          assert_equal 100, result.score

          patch "/api/v1/admin/assessments/#{assessment.id}",
                params: { public_result_rule: "latest_valid" },
                headers: @headers,
                as: :json

          assert_response :ok
          assert_equal 25, result.reload.score
        end

        # --- Import ----------------------------------------------------------

        test "an admin can dry-run then import a question bank" do
          document = import_document

          post "/api/v1/admin/assessment_imports",
               params: { document: document, dry_run: true },
               headers: @headers,
               as: :json
          assert_response :ok
          assert_equal true, JSON.parse(response.body)["dry_run"]
          assert_nil Assessment.find_by(slug: "imported_bank")

          post "/api/v1/admin/assessment_imports",
               params: { document: document },
               headers: @headers,
               as: :json
          assert_response :created
          body = JSON.parse(response.body)
          assert_equal true, body["published"]
          assert_equal 4, body["stats"]["questions_created"]

          assessment = Assessment.find_by!(slug: "imported_bank")
          assert assessment.live_version.published?
        end

        test "an invalid import reports every problem and writes nothing" do
          document = import_document
          document["categories"][0]["questions"][0]["choices"].each { |choice| choice["correct"] = false }

          post "/api/v1/admin/assessment_imports",
               params: { document: document },
               headers: @headers,
               as: :json

          assert_response :unprocessable_entity
          assert JSON.parse(response.body)["problems"].any?
          assert_nil Assessment.find_by(slug: "imported_bank")
        end

        test "the import schema is documented for the admin UI" do
          get "/api/v1/admin/assessment_imports/schema", headers: @headers

          assert_response :ok
          body = JSON.parse(response.body)
          assert body["example"].present?
          assert body["fields"].present?
          assert_equal "example_trade_knowledge", body["example"]["assessment"]["slug"]
        end

        private

        def draft_version_with_category
          assessment = Assessment.create!(slug: "draft_work_#{SecureRandom.hex(3)}", title: "Draft Work")
          version = assessment.assessment_versions.create!(
            version_number: 1, score_bands: Assessments::ScoreBands.starter_template
          )
          category = version.assessment_categories.create!(slug: "safety", name: "Safety", question_count: 1)
          { assessment: assessment, version: version, category: category }
        end

        def import_document
          {
            "assessment" => { "slug" => "imported_bank", "title" => "Imported Bank", "trade_type" => "Electrician" },
            "version" => { "version_number" => 1, "publish" => true, "time_limit_minutes" => 20 },
            "categories" => [
              {
                "slug" => "circuits",
                "name" => "Circuits",
                "question_count" => 2,
                "questions" => (1..4).map do |n|
                  {
                    "external_key" => "circuits_#{n}",
                    "prompt" => "Circuit question #{n}?",
                    "choices" => [
                      { "body" => "right #{n}", "correct" => true },
                      { "body" => "wrong #{n}", "correct" => false }
                    ]
                  }
                end
              }
            ]
          }
        end
      end
    end
  end
end
