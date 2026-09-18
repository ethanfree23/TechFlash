# frozen_string_literal: true

module Assessments
  # A machine-readable example of the content import document.
  #
  # Kept in code (rather than only in docs/ASSESSMENTS.md) so the admin UI and
  # the next content-authoring task can fetch the exact expected shape from the
  # running API, and so a test can assert the documented example actually
  # imports.
  class ImportSchema
    # Field-by-field reference for the import document, served alongside the
    # example so an admin importing a bank can see what each key means without
    # leaving the UI. Mirrors the table in docs/ASSESSMENTS.md.
    def self.fields
      {
        "assessment" => {
          "slug" => "Required. Stable identifier; re-importing the same slug updates that assessment.",
          "title" => "Required. Shown to technicians and companies.",
          "description" => "Optional blurb for the assessment card.",
          "trade_type" => "Optional trade from the trade catalog. Drives which technicians see it recommended.",
          "company_disclaimer" => "Optional override for the score disclaimer shown to companies.",
          "active" => "Optional, defaults true. Inactive assessments disappear from the catalog.",
          "position" => "Optional sort order in the catalog.",
          "public_result_rule" => "Optional: best_valid (default) or latest_valid."
        },
        "version" => {
          "version_number" => "Optional, defaults to the next number. Re-importing a published number is refused.",
          "publish" => "Optional, defaults false. When true the version is validated and published.",
          "on_published" => "Optional: refuse (default) or new_version to clone a published version into a draft.",
          "instructions" => "Optional text shown before the first question.",
          "time_limit_minutes" => "Optional. Omit for an untimed assessment.",
          "passing_score" => "Optional 0-100 benchmark. Omit to report a score with no pass/fail.",
          "max_attempts" => "Optional cap on attempts. Omit for unlimited.",
          "retake_wait_hours" => "Optional cooling-off period between attempts.",
          "randomize_questions" => "Optional, defaults true.",
          "randomize_answer_choices" => "Optional, defaults true.",
          "allow_resume" => "Optional, defaults true. Lets an interrupted attempt be picked back up.",
          "allow_back_navigation" => "Optional, defaults true.",
          "scoring_strategy" => "Optional: normalized_percent (default) or category_weighted.",
          "score_bands" => "Optional. Must cover 0-100 with no gaps or overlaps. Defaults to the starter template."
        },
        "categories" => {
          "slug" => "Required. Unique within the version and stored on results, so keep it stable.",
          "name" => "Required. Displayed on the category breakdown.",
          "description" => "Optional.",
          "question_count" => "Required. How many questions to draw from this category per attempt.",
          "weight" => "Optional, defaults 1.0. Only used by the category_weighted strategy.",
          "questions" => "Required. The bank to draw from; may be larger than question_count."
        },
        "questions" => {
          "external_key" => "Strongly recommended. Makes re-imports update in place instead of duplicating.",
          "prompt" => "Required question text.",
          "explanation" => "Optional. Shown to the technician only after they submit.",
          "difficulty" => "Optional: #{AssessmentQuestion.difficulties.keys.join(', ')}.",
          "active" => "Optional, defaults true. Questions dropped from a re-import are deactivated, not deleted.",
          "media_url" => "Optional image or diagram URL for future media questions.",
          "media_type" => "Optional media type hint, e.g. image.",
          "media_alt_text" => "Optional accessibility text for the media.",
          "choices" => "Required. At least two, with exactly one marked correct."
        },
        "choices" => {
          "key" => "Optional authoring label (a/b/c/d). Stored as the choice's external key.",
          "body" => "Required choice text.",
          "correct" => "Required boolean. Exactly one choice per question must be true."
        }
      }
    end

    def self.example
      {
        "assessment" => {
          "slug" => "example_trade_knowledge",
          "title" => "Example Trade Knowledge Assessment",
          "description" => "Test your trade knowledge and add your score to your TechFlash profile.",
          "trade_type" => "HVAC Technician",
          "company_disclaimer" => nil,
          "active" => true,
          "position" => 1,
          "public_result_rule" => "best_valid"
        },
        "version" => {
          "version_number" => 1,
          "publish" => true,
          "instructions" => "Answer each question to the best of your knowledge. You can go back and change answers before submitting.",
          "time_limit_minutes" => 30,
          "passing_score" => nil,
          "max_attempts" => nil,
          "retake_wait_hours" => nil,
          "randomize_questions" => true,
          "randomize_answer_choices" => true,
          "allow_resume" => true,
          "allow_back_navigation" => true,
          "scoring_strategy" => "normalized_percent",
          "score_bands" => ScoreBands.starter_template
        },
        "categories" => [
          {
            "slug" => "safety_and_tools",
            "name" => "Safety & Tools",
            "description" => "Jobsite safety practices and correct tool selection.",
            "question_count" => 1,
            "weight" => 1.0,
            "questions" => [
              {
                "external_key" => "example_v1_safety_001",
                "prompt" => "Which item must be de-energized and verified before servicing a unit?",
                "explanation" => "Always verify the circuit is de-energized with a meter before servicing.",
                "difficulty" => "easy",
                "active" => true,
                "choices" => [
                  { "key" => "a", "body" => "The line-voltage supply circuit", "correct" => true },
                  { "key" => "b", "body" => "The thermostat display", "correct" => false },
                  { "key" => "c", "body" => "The condensate drain", "correct" => false },
                  { "key" => "d", "body" => "The filter rack", "correct" => false }
                ]
              },
              {
                "external_key" => "example_v1_safety_002",
                "prompt" => "What is the correct first step when arriving at an unfamiliar jobsite?",
                "explanation" => "A hazard assessment comes before any tool is picked up.",
                "difficulty" => "easy",
                "active" => true,
                "choices" => [
                  { "key" => "a", "body" => "Perform a site hazard assessment", "correct" => true },
                  { "key" => "b", "body" => "Begin disassembly immediately", "correct" => false },
                  { "key" => "c", "body" => "Order replacement parts", "correct" => false }
                ]
              }
            ]
          }
        ]
      }
    end
  end
end
