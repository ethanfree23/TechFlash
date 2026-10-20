# frozen_string_literal: true

class AddJobContactUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :jobs, :primary_contact_user_id, :integer
    add_column :jobs, :additional_contact_user_ids, :json, default: [], null: false
    add_index :jobs, :primary_contact_user_id
  end
end
