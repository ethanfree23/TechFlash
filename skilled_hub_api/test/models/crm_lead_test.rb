require "test_helper"

class CrmLeadTest < ActiveSupport::TestCase
  test "allows competitor crm status" do
    lead = CrmLead.new(
      name: "Rival Company",
      status: "competitor"
    )

    assert lead.valid?, lead.errors.full_messages.join(", ")
  end

  test "allows multiple supported company types" do
    lead = CrmLead.new(
      name: "Multi-Trade Co",
      status: "lead",
      company_types: %w[hvac plumbing electrical]
    )

    assert lead.valid?, lead.errors.full_messages.join(", ")
  end

  test "allows linking crm lead to company profile with multiple company users" do
    owner = User.create!(
      email: "owner+crm_lead_test@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile = CompanyProfile.create!(
      user: owner,
      company_name: "CRM Link Co",
      phone: "555-333-4444",
      bio: "Profile for CRM linking test"
    )
    owner.update_column(:company_profile_id, profile.id)

    second_login = User.create!(
      email: "second.login+crm_lead_test@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      company_profile_id: profile.id
    )

    lead = CrmLead.new(
      name: "CRM Link Co",
      status: "prospect",
      linked_user_id: second_login.id,
      linked_company_profile_id: profile.id
    )

    assert lead.valid?, lead.errors.full_messages.join(", ")
  end

  test "rejects contact linked_user_id when crm lead has no linked company" do
    lead = CrmLead.new(
      name: "Solo Co",
      status: "lead",
      contacts: [{ "name" => "Pat", "email" => "pat@example.com", "phone" => "555-111-2222", "linked_user_id" => 999 }]
    )

    assert_not lead.valid?
    assert(
      lead.errors[:contacts].any? { |m| m.include?("cannot set linked_user_id") },
      "expected contacts error about linked_user_id, got: #{lead.errors[:contacts].inspect}"
    )
  end

  test "allows contact linked_user_id when it matches linked company profile" do
    owner = User.create!(
      email: "owner+crm_contact_link@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile = CompanyProfile.create!(
      user: owner,
      company_name: "Contact Link Co",
      phone: "555-000-0001",
      bio: "Test"
    )
    owner.update_column(:company_profile_id, profile.id)

    second_login = User.create!(
      email: "second+crm_contact_link@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      company_profile_id: profile.id
    )

    lead = CrmLead.new(
      name: "Contact Link Co",
      status: "lead",
      linked_company_profile_id: profile.id,
      linked_user_id: owner.id,
      contacts: [
        {
          "name" => "Second Person",
          "email" => "second+crm_contact_link@example.com",
          "phone" => "555-000-0002",
          "linked_user_id" => second_login.id
        }
      ]
    )

    assert lead.valid?, lead.errors.full_messages.join(", ")
  end

  test "rejects contact linked_user_id for user on a different company" do
    owner_a = User.create!(
      email: "owner.a+crm_contact_wrong_co@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile_a = CompanyProfile.create!(
      user: owner_a,
      company_name: "Company A CRM",
      phone: "555-555-1001",
      bio: "Company A profile"
    )
    owner_a.update_column(:company_profile_id, profile_a.id)

    owner_b = User.create!(
      email: "owner.b+crm_contact_wrong_co@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile_b = CompanyProfile.create!(
      user: owner_b,
      company_name: "Company B CRM",
      phone: "555-555-1002",
      bio: "Company B profile"
    )
    owner_b.update_column(:company_profile_id, profile_b.id)

    lead = CrmLead.new(
      name: "Uses A",
      status: "lead",
      linked_company_profile_id: profile_a.id,
      linked_user_id: owner_a.id,
      contacts: [
        {
          "name" => "Person B",
          "email" => "owner.b+crm_contact_wrong_co@example.com",
          "phone" => "555-555-2002",
          "linked_user_id" => owner_b.id
        }
      ]
    )

    assert_not lead.valid?
    assert(
      lead.errors[:contacts].any? { |m| m.include?("linked_user_id must be a company login") },
      "expected contacts error about wrong company user, got: #{lead.errors[:contacts].inspect}"
    )
  end

  test "rejects mismatched linked user and linked company profile" do
    owner_a = User.create!(
      email: "owner.a+crm_lead_test@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile_a = CompanyProfile.create!(
      user: owner_a,
      company_name: "Company A",
      phone: "555-555-0001",
      bio: "Company A profile"
    )
    owner_a.update_column(:company_profile_id, profile_a.id)

    owner_b = User.create!(
      email: "owner.b+crm_lead_test@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile_b = CompanyProfile.create!(
      user: owner_b,
      company_name: "Company B",
      phone: "555-555-0002",
      bio: "Company B profile"
    )
    owner_b.update_column(:company_profile_id, profile_b.id)

    lead = CrmLead.new(
      name: "Bad Link Co",
      status: "prospect",
      linked_user_id: owner_a.id,
      linked_company_profile_id: profile_b.id
    )

    assert_not lead.valid?
    assert_includes lead.errors[:linked_company_profile_id], "must match the selected company user"
  end
end
