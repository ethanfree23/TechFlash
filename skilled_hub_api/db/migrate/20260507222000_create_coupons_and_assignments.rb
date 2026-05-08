class CreateCouponsAndAssignments < ActiveRecord::Migration[7.1]
  def change
    create_table :coupons do |t|
      t.string :name, null: false
      t.string :code, null: false
      t.string :discount_kind, null: false, default: "percent"
      t.integer :discount_value, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.datetime :starts_at
      t.datetime :ends_at
      t.string :duration_template, null: false, default: "fixed_window"
      t.integer :duration_days
      t.timestamps
    end
    add_index :coupons, :code, unique: true

    create_table :coupon_assignments do |t|
      t.references :coupon, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :assigned_by, foreign_key: { to_table: :users }
      t.string :status, null: false, default: "active"
      t.boolean :auto_renew, null: false, default: false
      t.datetime :activated_at
      t.datetime :starts_at
      t.datetime :expires_at
      t.datetime :last_extended_at
      t.timestamps
    end
    add_index :coupon_assignments, [:coupon_id, :user_id]
  end
end
