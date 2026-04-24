require "test_helper"

class CrmLeadTest < ActiveSupport::TestCase
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
