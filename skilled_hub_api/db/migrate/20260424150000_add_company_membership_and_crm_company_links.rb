class AddCompanyMembershipAndCrmCompanyLinks < ActiveRecord::Migration[7.1]
  def up
    add_reference :users, :company_profile, foreign_key: true, index: true
    add_reference :crm_leads, :linked_company_profile, foreign_key: { to_table: :company_profiles }, index: true

    execute <<~SQL.squish
      UPDATE users
      SET company_profile_id = company_profiles.id
      FROM company_profiles
      WHERE company_profiles.user_id = users.id
        AND users.company_profile_id IS NULL
    SQL

    execute <<~SQL.squish
      UPDATE crm_leads
      SET linked_company_profile_id = company_profiles.id
      FROM users
      INNER JOIN company_profiles ON company_profiles.user_id = users.id
      WHERE crm_leads.linked_user_id = users.id
        AND crm_leads.linked_company_profile_id IS NULL
    SQL

    remove_index :crm_leads, :linked_user_id if index_exists?(:crm_leads, :linked_user_id, unique: true)
    add_index :crm_leads, :linked_user_id unless index_exists?(:crm_leads, :linked_user_id)
  end

  def down
    remove_index :crm_leads, :linked_user_id if index_exists?(:crm_leads, :linked_user_id)
    add_index :crm_leads, :linked_user_id, unique: true unless index_exists?(:crm_leads, :linked_user_id, unique: true)

    remove_reference :crm_leads, :linked_company_profile, foreign_key: { to_table: :company_profiles }, index: true
    remove_reference :users, :company_profile, foreign_key: true, index: true
  end
end
