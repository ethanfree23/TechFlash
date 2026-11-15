# frozen_string_literal: true

class AddAdminStarredToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :admin_starred, :boolean, default: false, null: false
    add_index :users, :admin_starred
  end
end
