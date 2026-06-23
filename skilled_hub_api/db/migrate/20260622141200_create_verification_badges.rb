class CreateVerificationBadges < ActiveRecord::Migration[7.1]
  def change
    create_table :verification_badges do |t|
      t.references :user, null: false, foreign_key: true
      t.string :badge_type, null: false
      t.string :source_type
      t.bigint :source_id
      t.integer :status, null: false, default: 0
      t.datetime :earned_at
      t.datetime :expires_at

      t.timestamps
    end

    add_index :verification_badges, [:user_id, :badge_type], unique: true
    add_index :verification_badges, [:source_type, :source_id]
    add_index :verification_badges, :status
    add_index :verification_badges, :expires_at
  end
end
