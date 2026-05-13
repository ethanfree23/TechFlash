# frozen_string_literal: true

class AddCompanyBioAndContactFieldsToCrmLeads < ActiveRecord::Migration[7.1]
  def up
    add_column :crm_leads, :bio, :text
    add_column :crm_leads, :company_email, :string
    add_column :crm_leads, :company_phone, :string

    execute <<~SQL.squish
      UPDATE crm_leads
      SET company_email = email,
          company_phone = phone
    SQL
  end

  def down
    remove_column :crm_leads, :bio
    remove_column :crm_leads, :company_email
    remove_column :crm_leads, :company_phone
  end
end
