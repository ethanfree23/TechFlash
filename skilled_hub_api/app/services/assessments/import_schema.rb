# frozen_string_literal: true

module Assessments
  # A machine-readable example of the content import document.
  #
  # Kept in code (rather than only in docs/ASSESSMENTS.md) so the admin UI and
  # the next content-authoring task can fetch the exact expected shape from the
  # running API, and so a test can assert the documented example actually
  # imports.
  class ImportSchema
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
