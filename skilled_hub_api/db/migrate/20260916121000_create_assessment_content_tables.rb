# frozen_string_literal: true

class CreateAssessmentContentTables < ActiveRecord::Migration[7.1]
  def change
    return if table_exists?(:assessments)

    create_table :assessments do |t|
      t.string :slug, null: false
      t.string :title, null: false
      t.text :description
      t.text :company_disclaimer
      t.string :trade_type
      t.boolean :active, null: false, default: true
      t.string :public_result_rule, null: false, default: "best_valid"
      t.integer :position, null: false, default: 0
      t.json :metadata, default: {}, null: false
      t.timestamps
    end

    add_index :assessments, :slug, unique: true
    add_index :assessments, :trade_type
    add_index :assessments, :active

    create_table :assessment_versions do |t|
      t.references :assessment, null: false, foreign_key: true
      t.integer :version_number, null: false, default: 1
      t.integer :status, null: false, default: 0
      t.text :instructions
      t.integer :question_count, null: false, default: 0
      t.integer :time_limit_minutes
      t.integer :passing_score
      t.integer :max_attempts
      t.integer :retake_wait_hours
      t.boolean :randomize_questions, null: false, default: true
      t.boolean :randomize_answer_choices, null: false, default: true
      t.boolean :allow_resume, null: false, default: true
      t.boolean :allow_back_navigation, null: false, default: true
      t.string :scoring_strategy, null: false, default: "normalized_percent"
      t.json :score_bands, default: [], null: false
      t.datetime :published_at
      t.datetime :retired_at
      t.json :metadata, default: {}, null: false
      t.timestamps
    end

    add_index :assessment_versions, %i[assessment_id version_number], unique: true
    add_index :assessment_versions, %i[assessment_id status]

    create_table :assessment_categories do |t|
      t.references :assessment_version, null: false, foreign_key: true
      t.string :slug, null: false
      t.string :name, null: false
      t.text :description
      t.integer :question_count, null: false, default: 0
      t.decimal :weight, precision: 8, scale: 4, null: false, default: 1.0
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_index :assessment_categories, %i[assessment_version_id slug],
              unique: true,
              name: "index_assessment_categories_on_version_and_slug"
    add_index :assessment_categories, %i[assessment_version_id position],
              name: "index_assessment_categories_on_version_and_position"

    create_table :assessment_questions do |t|
      t.references :assessment_version, null: false, foreign_key: true
      t.references :assessment_category, null: false, foreign_key: true
      t.string :external_key
      t.text :prompt, null: false
      t.text :explanation
      t.integer :difficulty, null: false, default: 1
      t.boolean :active, null: false, default: true
      t.integer :position, null: false, default: 0
      t.string :media_url
      t.string :media_type
      t.string :media_alt_text
      t.json :metadata, default: {}, null: false
      t.timestamps
    end

    add_index :assessment_questions, %i[assessment_version_id active],
              name: "index_assessment_questions_on_version_and_active"
    add_index :assessment_questions, %i[assessment_category_id active],
              name: "index_assessment_questions_on_category_and_active"
    add_index :assessment_questions, %i[assessment_version_id external_key],
              unique: true,
              where: "external_key IS NOT NULL",
              name: "index_assessment_questions_on_version_and_external_key"

    create_table :assessment_answer_choices do |t|
      t.references :assessment_question, null: false, foreign_key: true
      t.string :external_key
      t.text :body, null: false
      t.boolean :correct, null: false, default: false
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_index :assessment_answer_choices, %i[assessment_question_id position],
              name: "index_assessment_answer_choices_on_question_and_position"
    add_index :assessment_answer_choices, %i[assessment_question_id correct],
              name: "index_assessment_answer_choices_on_question_and_correct"
  end
end
