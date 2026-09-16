# frozen_string_literal: true

# Denormalized projection of the single result a technician publishes to companies.
# Rebuilt from completed attempts by Assessments::PublicResultProjector so that
# company-facing reads and future technician-search filters stay a simple join.
class CreateTechnicianAssessmentResults < ActiveRecord::Migration[7.1]
  def change
    create_table :technician_assessment_results do |t|
      t.references :technician_profile, null: false, foreign_key: true
      t.references :assessment, null: false, foreign_key: true
      t.references :assessment_attempt, null: false, foreign_key: true
      t.references :assessment_version, null: false, foreign_key: true
      t.string :selection_rule, null: false, default: "best_valid"
      t.integer :score, null: false
      t.string :score_band_slug
      t.string :score_band_label
      t.boolean :passed
      t.datetime :completed_at, null: false
      t.integer :attempts_count, null: false, default: 0
      t.integer :best_score
      t.integer :latest_score
      t.datetime :latest_completed_at
      t.json :category_scores, default: [], null: false
      t.timestamps
    end

    add_index :technician_assessment_results, %i[technician_profile_id assessment_id],
              unique: true,
              name: "index_technician_assessment_results_on_tech_and_assessment"
    add_index :technician_assessment_results, %i[assessment_id score],
              name: "index_technician_assessment_results_on_assessment_and_score"
    add_index :technician_assessment_results, :score
    add_index :technician_assessment_results, :score_band_slug
  end
end
