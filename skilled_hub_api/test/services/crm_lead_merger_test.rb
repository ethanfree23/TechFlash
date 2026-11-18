# frozen_string_literal: true

require "test_helper"

class CrmLeadMergerTest < ActiveSupport::TestCase
  test "absorb_unlinked_into_linked moves timeline notes and fills blank company fields" do
    owner = User.create!(
      email: "owner+triplet_merge@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Matt",
      last_name: "Walker"
    )
    profile = CompanyProfile.create!(
      user: owner,
      company_name: "Triplet Diesel",
      industry: "Auto Shop",
      membership_level: "basic"
    )
    owner.update_column(:company_profile_id, profile.id)

    linked = CrmLead.create!(
      name: "Triplet Diesel",
      contact_name: "Matt Walker",
      email: "matt.walker@example.com",
      phone: "+1 (254) 753-1114",
      status: "customer",
      linked_user_id: owner.id,
      linked_company_profile_id: profile.id,
      contacts: [{ "name" => "Matt Walker", "email" => "matt.walker@example.com", "phone" => "+1 (254) 753-1114" }],
      notes: "Linked account note"
    )
    unlinked = CrmLead.create!(
      name: "Triplet Diesel",
      contact_name: "Matt Triplet",
      email: "matt@tripletdiesel.com",
      phone: "+1 (888) 379-6779",
      company_email: "parts@tripletdiesel.com",
      company_phone: "+1 (888) 379-6779",
      website: "https://www.tripletdiesel.com/",
      street_address: "417 Mill St",
      city: "Waco",
      state: "TX",
      zip: "76704",
      status: "lead",
      company_types: ["automotive"],
      contacts: [
        {
          "name" => "Matt Triplet",
          "email" => "matt@tripletdiesel.com",
          "phone" => "+1 (888) 379-6779",
          "job_title" => "Owner"
        }
      ],
      notes: "Prospect research"
    )
    unlinked.crm_notes.create!(contact_method: "call", body: "Called Matt Triplet about diesel work")
    unlinked.crm_notes.create!(contact_method: "email", body: "Follow-up email logged")

    result = CrmLeadMerger.absorb_unlinked_into_linked!(source: unlinked, target: linked)

    assert_equal linked.id, result.target_id
    assert_equal unlinked.id, result.source_id
    assert_not CrmLead.exists?(unlinked.id)

    linked.reload
    assert_equal "customer", linked.status
    assert_equal owner.id, linked.linked_user_id
    assert_equal profile.id, linked.linked_company_profile_id
    assert_equal "parts@tripletdiesel.com", linked.company_email
    assert_equal "https://www.tripletdiesel.com/", linked.website
    assert_equal "417 Mill St", linked.street_address
    assert_equal "Waco", linked.city
    assert_equal "TX", linked.state
    assert_equal "76704", linked.zip
    assert_includes linked.company_types, "automotive"
    assert_equal 2, linked.contacts.length
    assert_equal "Matt Walker", linked.contacts.first["name"]
    assert_includes linked.contacts.map { |c| c["name"] }, "Matt Triplet"
    assert_includes linked.notes, "Linked account note"
    assert_includes linked.notes, "Prospect research"
    assert_equal 2, linked.crm_notes.count
    assert_includes linked.crm_notes.pluck(:body), "Called Matt Triplet about diesel work"
  end

  test "merge_named_duplicate is a no-op when only one Triplet Diesel lead exists" do
    CrmLead.create!(name: "Triplet Diesel", status: "lead")
    assert_nil CrmLeadMerger.merge_named_duplicate!(company_name: "Triplet Diesel")
    assert_equal 1, CrmLead.where("LOWER(TRIM(name)) = ?", "triplet diesel").count
  end
end
