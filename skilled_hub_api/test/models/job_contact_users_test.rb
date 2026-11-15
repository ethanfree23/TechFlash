# frozen_string_literal: true

require "test_helper"

class JobContactUsersTest < ActiveSupport::TestCase
  setup do
    @owner = User.create!(
      email: "owner+job-contacts@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Paul",
      last_name: "Ellenberger"
    )
    @profile = CompanyProfile.create!(
      user: @owner,
      company_name: "Hughes Systems Industrial",
      phone: "555-100-2000",
      bio: "Contact prefs test"
    )
    @owner.update_column(:company_profile_id, @profile.id)
    @other = User.create!(
      email: "other+job-contacts@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      company_profile_id: @profile.id,
      first_name: "Alex",
      last_name: "Rivera"
    )
  end

  test "login_users includes owner and additional company logins" do
    ids = @profile.login_users.map(&:id)
    assert_includes ids, @owner.id
    assert_includes ids, @other.id
    assert_equal 2, ids.length
  end

  test "company_contact_users prefers primary then additional" do
    job = Job.create!(
      company_profile: @profile,
      title: "Journeyman Electrician",
      description: "Test job",
      status: :draft,
      skill_class: "Journeyman",
      trade_type: "Electrician",
      primary_contact_user_id: @other.id,
      additional_contact_user_ids: [@owner.id]
    )

    contacts = job.company_contact_users
    assert_equal [@other.id, @owner.id], contacts.map(&:id)
  end

  test "rejects contact users outside the company" do
    stranger = User.create!(
      email: "stranger+job-contacts@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Sam",
      last_name: "Stranger"
    )
    job = Job.new(
      company_profile: @profile,
      title: "Bad contacts",
      description: "Test",
      status: :draft,
      skill_class: "Journeyman",
      trade_type: "Electrician",
      primary_contact_user_id: stranger.id
    )

    assert_not job.valid?
    assert_includes job.errors[:primary_contact_user_id].join, "must be a login"
  end

  test "template reusable fields include contact preferences" do
    assert_includes JobTemplate::REUSABLE_FIELDS, "primary_contact_user_id"
    assert_includes JobTemplate::REUSABLE_FIELDS, "additional_contact_user_ids"
  end
end
