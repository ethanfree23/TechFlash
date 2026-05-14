# frozen_string_literal: true

class AddRemindAtToCrmNotes < ActiveRecord::Migration[7.1]
  def change
    add_column :crm_notes, :remind_at, :datetime
    add_index :crm_notes, :remind_at
  end
end
