# frozen_string_literal: true

class CreateBackgroundCheckAcknowledgements < ActiveRecord::Migration[7.1]
  def change
    create_table :background_check_acknowledgements do |t|
      t.integer :user_id, null: false
      t.string :acknowledgement_type, null: false
      t.string :document_version, null: false
      t.boolean :accepted, null: false, default: false
      t.datetime :accepted_at
      t.integer :actor_user_id, null: false
      t.string :ip_address
      t.string :user_agent
      t.timestamps
    end

    add_index :background_check_acknowledgements,
              %i[user_id acknowledgement_type],
              unique: true,
              name: "idx_bg_ack_on_user_and_type"
    add_index :background_check_acknowledgements, :actor_user_id
    add_foreign_key :background_check_acknowledgements, :users
    add_foreign_key :background_check_acknowledgements, :users, column: :actor_user_id
  end
end
