# frozen_string_literal: true

# One-time: fold the unlinked Triplet Diesel CRM lead (call history, contacts,
# company info) into the linked TechFlash customer record, then delete the unlinked duplicate.
class MergeTripletDieselCrmLeads < ActiveRecord::Migration[7.1]
  COMPANY_NAME = "Triplet Diesel"

  def up
    CrmLeadMerger.merge_named_duplicate!(company_name: COMPANY_NAME)
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
