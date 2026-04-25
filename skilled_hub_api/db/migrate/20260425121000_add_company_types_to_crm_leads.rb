# frozen_string_literal: true

class AddCompanyTypesToCrmLeads < ActiveRecord::Migration[7.1]
  def change
    add_column :crm_leads, :company_types, :json, null: false, default: []
  end
end
