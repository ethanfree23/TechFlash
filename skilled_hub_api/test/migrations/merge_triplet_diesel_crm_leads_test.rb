# frozen_string_literal: true

require "test_helper"
require Rails.root.join("db/migrate/20261118190000_merge_triplet_diesel_crm_leads").to_s

class MergeTripletDieselCrmLeadsTest < ActiveSupport::TestCase
  test "is a no-op when Triplet Diesel CRM duplicates are absent" do
    assert_equal 0, CrmLead.where("LOWER(TRIM(name)) = ?", "triplet diesel").count
    assert_nothing_raised { MergeTripletDieselCrmLeads.new.up }
  end

  test "merges unlinked Triplet Diesel into the linked customer" do
    owner = User.create!(
      email: "owner+triplet_mig@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
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
      phone: "+1 (254) 753-1114",
      status: "customer",
      linked_user_id: owner.id,
      linked_company_profile_id: profile.id,
      contacts: [{ "name" => "Matt Walker", "phone" => "+1 (254) 753-1114" }]
    )
    unlinked = CrmLead.create!(
      name: "Triplet Diesel",
      contact_name: "Matt Triplet",
      company_email: "parts@tripletdiesel.com",
      website: "https://www.tripletdiesel.com/",
      street_address: "417 Mill St",
      city: "Waco",
      state: "TX",
      zip: "76704",
      status: "lead",
      contacts: [{ "name" => "Matt Triplet", "email" => "matt@tripletdiesel.com", "phone" => "+1 (888) 379-6779" }]
    )
    unlinked.crm_notes.create!(contact_method: "call", body: "Logged sales call")

    MergeTripletDieselCrmLeads.new.up

    assert_not CrmLead.exists?(unlinked.id)
    linked.reload
    assert_equal "customer", linked.status
    assert_equal profile.id, linked.linked_company_profile_id
    assert_equal "parts@tripletdiesel.com", linked.company_email
    assert_equal "417 Mill St", linked.street_address
    assert_equal 1, linked.crm_notes.count
    assert_equal "Logged sales call", linked.crm_notes.first.body
  end
end
