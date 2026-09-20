# frozen_string_literal: true

class CreateAssessmentAttemptTables < ActiveRecord::Migration[7.1]
  def change
    return if table_exists?(:assessment_attempts)

    create_table :assessment_attempts do |t|
      t.references :technician_profile, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :assessment, null: false, foreign_key: true
      t.references :assessment_version, null: false, foreign_key: true
      t.integer :attempt_number, null: false, default: 1
      t.integer :status, null: false, default: 0
      t.datetime :started_at, null: false
      t.datetime :expires_at
      t.datetime :submitted_at
      t.datetime :completed_at
      t.datetime :last_activity_at
      t.integer :duration_seconds
      t.integer :total_questions, null: false, default: 0
      t.integer :answered_questions, null: false, default: 0
      t.integer :correct_answers, null: false, default: 0
      t.integer :score
      t.decimal :raw_score, precision: 9, scale: 4
      t.string :score_band_slug
      t.string :score_band_label
      t.boolean :passed
      t.integer :time_limit_minutes
      t.string :selection_seed
      t.json :config_snapshot, default: {}, null: false
      t.timestamps
    end

    add_index :assessment_attempts, %i[technician_profile_id assessment_id status],
              name: "index_assessment_attempts_on_tech_assessment_status"
    add_index :assessment_attempts, %i[technician_profile_id assessment_id attempt_number],
              unique: true,
              name: "index_assessment_attempts_on_tech_assessment_number"
    add_index :assessment_attempts, %i[assessment_id status score],
              name: "index_assessment_attempts_on_assessment_status_score"
    add_index :assessment_attempts, %i[assessment_version_id status],
              name: "index_assessment_attempts_on_version_and_status"
    add_index :assessment_attempts, :completed_at

    # Guards the "one live attempt per technician per assessment" invariant at the
    # database level so concurrent start requests cannot both create an attempt.
    add_index :assessment_attempts, %i[technician_profile_id assessment_id],
              unique: true,
              where: "status = 0",
              name: "index_assessment_attempts_one_in_progress_per_assessment"

    create_table :assessment_attempt_questions do |t|
      t.references :assessment_attempt, null: false, foreign_key: true
      t.references :assessment_question, null: false, foreign_key: true
      t.references :assessment_category, null: false, foreign_key: true
      t.integer :position, null: false
      t.json :choice_order, default: [], null: false
      t.integer :selected_answer_choice_id
      t.boolean :correct
      t.datetime :answered_at
      t.timestamps
    end

    add_index :assessment_attempt_questions, %i[assessment_attempt_id position],
              unique: true,
              name: "index_assessment_attempt_questions_on_attempt_and_position"
    add_index :assessment_attempt_questions, %i[assessment_attempt_id assessment_question_id],
              unique: true,
              name: "index_assessment_attempt_questions_on_attempt_and_question"

    create_table :assessment_attempt_category_results do |t|
      t.references :assessment_attempt, null: false, foreign_key: true
      t.references :assessment_category, null: false, foreign_key: true
      t.string :category_slug, null: false
      t.string :category_name, null: false
      t.integer :questions_count, null: false, default: 0
      t.integer :correct_count, null: false, default: 0
      t.integer :score, null: false, default: 0
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_index :assessment_attempt_category_results, %i[assessment_attempt_id assessment_category_id],
              unique: true,
              name: "index_attempt_category_results_on_attempt_and_category"
    add_index :assessment_attempt_category_results, %i[category_slug score],
              name: "index_attempt_category_results_on_slug_and_score"
  end
end
