# frozen_string_literal: true

require "test_helper"

class CrmCompanyContactSyncTest < ActiveSupport::TestCase
  test "updates existing contact matched by linked_user_id and preserves extra fields" do
    owner = User.create!(
      email: "owner-sync-linked@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Olivia",
      last_name: "Owner",
      phone: "555-101-1000"
    )
    profile = CompanyProfile.create!(user: owner, company_name: "Sync Linked Co", phone: "555-101-1000", bio: "Bio")
    owner.update_column(:company_profile_id, profile.id)

    lead = CrmLead.create!(
      name: "Sync Linked Co",
      status: "lead",
      linked_company_profile_id: profile.id,
      contacts: [
        {
          "name" => "Old Name",
          "email" => "old-contact@example.com",
          "phone" => "555-000-0000",
          "linked_user_id" => owner.id,
          "instagram_url" => "https://instagram.com/existing"
        }
      ]
    )

    owner.update!(first_name: "Updated", last_name: "Person", phone: "555-111-2222")
    assert CrmCompanyContactSync.sync_user!(user: owner, company_profile: profile)

    lead.reload
    assert_equal 1, lead.contacts.length
    contact = lead.contacts.first.with_indifferent_access
    assert_equal owner.id, contact[:linked_user_id]
    assert_equal "Updated Person", contact[:name]
    assert_equal "owner-sync-linked@example.com", contact[:email]
    assert_equal "555-111-2222", contact[:phone]
    assert_equal "https://instagram.com/existing", contact[:instagram_url]
  end

  test "matches by email before appending duplicate contacts" do
    owner = User.create!(
      email: "owner-sync-email@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Eli",
      last_name: "Owner",
      phone: "555-202-1000"
    )
    profile = CompanyProfile.create!(user: owner, company_name: "Sync Email Co", phone: "555-202-1000", bio: "Bio")
    owner.update_column(:company_profile_id, profile.id)

    second = User.create!(
      email: "second-sync-email@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Sam",
      last_name: "Second",
      phone: "555-202-3000",
      company_profile_id: profile.id
    )

    lead = CrmLead.create!(
      name: "Sync Email Co",
      status: "lead",
      linked_company_profile_id: profile.id,
      contacts: [
        {
          "name" => "Legacy Row",
          "email" => "SECOND-SYNC-EMAIL@EXAMPLE.COM",
          "phone" => "555-999-9999"
        }
      ]
    )

    assert CrmCompanyContactSync.sync_user!(user: second)

    lead.reload
    assert_equal 1, lead.contacts.length
    contact = lead.contacts.first.with_indifferent_access
    assert_equal second.id, contact[:linked_user_id]
    assert_equal "Sam Second", contact[:name]
    assert_equal "second-sync-email@example.com", contact[:email]
    assert_equal "555-202-3000", contact[:phone]
  end
end
