class CreateReferralSubmissions < ActiveRecord::Migration[7.1]
  def change
    create_table :referral_submissions do |t|
      t.references :referrer_user, null: false, foreign_key: { to_table: :users }
      t.references :referred_user, null: true, foreign_key: { to_table: :users }
      t.references :crm_lead, null: true, foreign_key: true
      t.string :first_name, null: false
      t.string :last_name, null: false
      t.string :cell_phone
      t.string :referred_type, null: false
      t.string :email, null: false
      t.string :location
      t.text :extra_info
      t.datetime :reward_eligible_at
      t.datetime :reward_issued_at

      t.timestamps
    end

    add_index :referral_submissions, :email
    add_index :referral_submissions, :referred_type
    add_index :referral_submissions, :reward_eligible_at
  end
end
