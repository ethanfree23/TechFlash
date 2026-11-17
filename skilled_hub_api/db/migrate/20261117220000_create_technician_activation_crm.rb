# frozen_string_literal: true

class CreateTechnicianActivationCrm < ActiveRecord::Migration[7.1]
  def change
    create_table :technician_activations do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :status, null: false, default: "new"
      t.datetime :last_contacted_at
      t.string :last_interaction_type
      t.string :last_call_outcome
      t.datetime :next_follow_up_at
      t.string :current_availability, null: false, default: "unknown"
      t.datetime :status_updated_at
      t.references :status_updated_by, foreign_key: { to_table: :users }, null: true

      t.timestamps
    end

    add_index :technician_activations, :status
    add_index :technician_activations, :last_contacted_at
    add_index :technician_activations, :next_follow_up_at
    add_index :technician_activations, :last_call_outcome
    add_index :technician_activations, :current_availability

    create_table :technician_interactions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.string :interaction_type, null: false, default: "note"
      t.string :outcome
      t.text :body
      t.datetime :follow_up_at
      t.datetime :occurred_at, null: false
      t.string :client_key
      t.json :metadata, null: false, default: {}

      t.timestamps
    end

    add_index :technician_interactions, %i[user_id occurred_at],
              name: "index_technician_interactions_on_user_and_occurred_at"
    add_index :technician_interactions, :interaction_type
    add_index :technician_interactions, :outcome
    add_index :technician_interactions, %i[user_id client_key],
              unique: true,
              name: "index_technician_interactions_on_user_and_client_key"

    create_table :technician_follow_ups do |t|
      t.references :user, null: false, foreign_key: true
      t.references :assigned_admin, null: false, foreign_key: { to_table: :users }
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.datetime :due_at, null: false
      t.string :status, null: false, default: "open"
      t.text :description
      t.datetime :completed_at
      t.references :technician_interaction, foreign_key: true, null: true

      t.timestamps
    end

    add_index :technician_follow_ups, %i[status due_at]
    add_index :technician_follow_ups, %i[assigned_admin_id status]
    add_index :technician_follow_ups, %i[user_id status]
  end
end
