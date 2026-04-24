class CreateMarketingLeads < ActiveRecord::Migration[7.1]
  def change
    create_table :marketing_leads do |t|
      t.string :email, null: false
      t.string :role_view, null: false, default: "technician"
      t.string :source, null: false, default: "landing_page"
      t.boolean :honeypot_triggered, null: false, default: false
      t.datetime :blocked_at

      t.timestamps
    end

    add_index :marketing_leads, :email, unique: true
  end
end
