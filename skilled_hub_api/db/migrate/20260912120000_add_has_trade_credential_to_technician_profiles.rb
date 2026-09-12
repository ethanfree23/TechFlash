# frozen_string_literal: true

class AddHasTradeCredentialToTechnicianProfiles < ActiveRecord::Migration[7.1]
  def up
    add_column :technician_profiles, :has_trade_credential, :boolean

    say_with_time "backfill has_trade_credential=true from GHL document metadata" do
      Document.where(uploadable_type: "TechnicianProfile", doc_type: %w[license certificate cert]).find_each do |doc|
        meta = doc.metadata
        meta = JSON.parse(meta) if meta.is_a?(String)
        flag = meta.is_a?(Hash) ? meta.stringify_keys["has_trade_credential"] : nil
        next unless ActiveModel::Type::Boolean.new.cast(flag)

        TechnicianProfile.where(id: doc.uploadable_id, has_trade_credential: nil)
          .update_all(has_trade_credential: true)
      end
    end
  end

  def down
    remove_column :technician_profiles, :has_trade_credential
  end
end
