# frozen_string_literal: true

# Builders for assessment tests. Follows the repo convention of creating records
# inline with create! rather than fixtures/factories.
module AssessmentTestHelper
  # Builds a published assessment with a bank larger than the paper, so tests
  # exercise real randomization rather than "the bank is the paper".
  #
  # categories: { slug => { name:, blueprint:, bank: } }
  def create_published_assessment!(
    slug: "test_knowledge",
    title: "Test Knowledge Assessment",
    trade_type: "HVAC Technician",
    time_limit_minutes: 30,
    max_attempts: nil,
    retake_wait_hours: nil,
    allow_resume: true,
    passing_score: nil,
    scoring_strategy: "normalized_percent",
    score_bands: nil,
    categories: { "safety" => { name: "Safety & Tools", blueprint: 2, bank: 5 } }
  )
    assessment = Assessment.create!(slug: slug, title: title, trade_type: trade_type)
    version = assessment.assessment_versions.create!(
      version_number: 1,
      status: :draft,
      time_limit_minutes: time_limit_minutes,
      max_attempts: max_attempts,
      retake_wait_hours: retake_wait_hours,
      allow_resume: allow_resume,
      passing_score: passing_score,
      scoring_strategy: scoring_strategy,
      score_bands: score_bands || Assessments::ScoreBands.starter_template
    )

    categories.each_with_index do |(category_slug, config), index|
      category = version.assessment_categories.create!(
        slug: category_slug,
        name: config[:name] || category_slug.titleize,
        question_count: config[:blueprint],
        weight: config[:weight] || 1.0,
        position: index
      )
      (config[:bank] || config[:blueprint]).times do |n|
        create_question!(version: version, category: category, key: "#{category_slug}_#{n + 1}", position: n)
      end
    end

    result = Assessments::VersionPublisher.publish!(version.reload)
    raise "publish failed: #{result.problems.inspect}" unless result.success?

    assessment.reload
  end

  # Every question gets the same shape: one correct choice whose body is
  # "correct", so tests can answer correctly or incorrectly by intent.
  def create_question!(version:, category:, key:, position: 0, active: true, choices: 4)
    question = version.assessment_questions.create!(
      assessment_category: category,
      external_key: key,
      prompt: "#{key} prompt?",
      explanation: "#{key} explanation",
      difficulty: :medium,
      active: active,
      position: position
    )
    question.assessment_answer_choices.create!(body: "correct", correct: true, position: 0)
    (choices - 1).times do |n|
      question.assessment_answer_choices.create!(body: "wrong #{n + 1}", correct: false, position: n + 1)
    end
    question
  end

  def create_technician!(email: nil, trade_type: "HVAC Technician")
    user = User.create!(
      email: email || "assessment-tech-#{SecureRandom.hex(6)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Tess",
      last_name: "Tech"
    )
    profile = TechnicianProfile.create!(
      user: user,
      trade_type: trade_type,
      availability: "Full-time",
      phone: "713-555-0100",
      city: "Houston"
    )
    [user, profile]
  end

  def create_company!(email: nil)
    user = User.create!(
      email: email || "assessment-co-#{SecureRandom.hex(6)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      phone: "713-555-0200"
    )
    profile = CompanyProfile.create!(user: user, company_name: "Assessment Co", membership_level: "basic")
    [user, profile]
  end

  def create_assessment_admin!(email: nil)
    User.create!(
      email: email || "assessment-admin-#{SecureRandom.hex(6)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin,
      phone: "713-555-0300"
    )
  end

  # Answers `correct_count` of the attempt's questions correctly and the rest
  # incorrectly, leaving `leave_blank` unanswered.
  def answer_attempt!(attempt, correct_count:, leave_blank: 0)
    rows = attempt.assessment_attempt_questions.ordered.to_a
    answerable = rows.first(rows.size - leave_blank)

    answers = answerable.each_with_index.map do |attempt_question, index|
      correct_id = attempt_question.assessment_question.correct_answer_choice.id
      choice_id =
        if index < correct_count
          correct_id
        else
          (attempt_question.presentation_choice_ids - [correct_id]).first
        end

      { "question_id" => attempt_question.assessment_question_id, "answer_choice_id" => choice_id }
    end

    Assessments::SaveAnswers.call(attempt: attempt, answers: answers)
  end

  # Completes an attempt end to end and returns the scored attempt.
  def complete_attempt!(technician_profile:, assessment:, correct_count:, leave_blank: 0)
    started = Assessments::StartAttempt.call(technician_profile: technician_profile, assessment: assessment)
    raise "start failed: #{started.error_message}" unless started.success?

    answer_attempt!(started.attempt, correct_count: correct_count, leave_blank: leave_blank)
    Assessments::SubmitAttempt.call(attempt: started.attempt.reload).attempt
  end
end
