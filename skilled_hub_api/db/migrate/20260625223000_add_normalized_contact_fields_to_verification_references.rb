# frozen_string_literal: true

class AddNormalizedContactFieldsToVerificationReferences < ActiveRecord::Migration[7.1]
  class MigrationVerificationReference < ApplicationRecord
    self.table_name = "verification_references"
  end

  def up
    add_column :verification_references, :email_normalized, :string
    add_column :verification_references, :phone_normalized, :string

    MigrationVerificationReference.reset_column_information
    backfill_normalized_contact_fields!
    ensure_no_duplicate_contacts!

    add_index :verification_references,
              [:technician_user_id, :email_normalized],
              unique: true,
              name: "index_verification_references_on_tech_and_email_normalized"
    add_index :verification_references,
              [:technician_user_id, :phone_normalized],
              unique: true,
              name: "index_verification_references_on_tech_and_phone_normalized"
  end

  def down
    remove_index :verification_references, name: "index_verification_references_on_tech_and_email_normalized"
    remove_index :verification_references, name: "index_verification_references_on_tech_and_phone_normalized"
    remove_column :verification_references, :email_normalized
    remove_column :verification_references, :phone_normalized
  end

  private

  def backfill_normalized_contact_fields!
    MigrationVerificationReference.find_each do |reference|
      reference.update_columns(
        email_normalized: normalize_email(reference.email),
        phone_normalized: normalize_phone(reference.phone)
      )
    end
  end

  def ensure_no_duplicate_contacts!
    duplicate_emails = MigrationVerificationReference
      .where.not(email_normalized: [nil, ""])
      .group(:technician_user_id, :email_normalized)
      .having("COUNT(*) > 1")
      .count
    duplicate_phones = MigrationVerificationReference
      .where.not(phone_normalized: [nil, ""])
      .group(:technician_user_id, :phone_normalized)
      .having("COUNT(*) > 1")
      .count

    return if duplicate_emails.empty? && duplicate_phones.empty?

    raise ActiveRecord::IrreversibleMigration,
          "Cannot add unique contact indexes: duplicate verification reference email/phone values exist for one or more technicians."
  end

  def normalize_email(value)
    value.to_s.strip.downcase.presence
  end

  def normalize_phone(value)
    value.to_s.gsub(/\D/, "").presence
  end
end
