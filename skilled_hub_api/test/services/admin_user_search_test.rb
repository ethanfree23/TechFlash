# frozen_string_literal: true

require "test_helper"

class AdminUserSearchTest < ActiveSupport::TestCase
  test "postgres SQL uses regexp_replace, full-name concatenation, and EXISTS rather than joins" do
    search = AdminUserSearch.new(User.where(role: :technician), "832")
    def search.postgresql?
      true
    end

    sql = search.apply.to_sql
    assert_includes sql, "regexp_replace"
    assert_includes sql, "[^0-9]"
    assert_includes sql, " || "
    assert_includes sql, "EXISTS ("
    assert_includes sql, "technician_profiles"
    assert_includes sql, "company_profiles"
    refute_match(/LEFT OUTER JOIN/i, sql)
    refute_match(/\bDISTINCT\b/i, sql)
    assert_includes sql, "CAST(users.id AS TEXT) LIKE"
  end

  test "numeric search is not restricted to user id" do
    user = User.create!(
      email: "phone-not-id@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Pat",
      last_name: "Area",
      phone: "+1 (832) 555-0109"
    )
    TechnicianProfile.create!(user: user, trade_type: "Electrician", availability: "Full-time", phone: user.phone)

    ids = AdminUserSearch.apply(User.where(role: :technician), "832").pluck(:id)
    assert_includes ids, user.id
    refute_includes user.id.to_s, "832", "fixture id unexpectedly contains 832; pick another assertion if this flakes"
  end

  test "finds formatted users.phone when phone_normalized is nil" do
    user = User.create!(
      email: "phone-norm-nil@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Norm",
      last_name: "Nil",
      phone: "+1 (832) 555-0110"
    )
    TechnicianProfile.create!(user: user, trade_type: "Electrician", availability: "Full-time")
    user.update_columns(phone_normalized: nil)

    assert_nil user.reload.phone_normalized
    assert_includes AdminUserSearch.apply(User.where(role: :technician), "832").pluck(:id), user.id
  end

  test "finds technician profile phone when account phone is blank" do
    user = User.create!(
      email: "tech-profile-phone-only@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Profile",
      last_name: "Only",
      phone: nil
    )
    TechnicianProfile.create!(
      user: user,
      trade_type: "Electrician",
      availability: "Full-time",
      phone: "(832) 555-0111"
    )
    user.update_columns(phone: nil, phone_normalized: nil)

    assert_includes AdminUserSearch.apply(User.where(role: :technician), "832").pluck(:id), user.id
  end

  test "finds company profile phone when account phone is blank" do
    user = User.create!(
      email: "co-profile-phone-only@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Biz",
      last_name: "Line",
      phone: nil
    )
    CompanyProfile.create!(
      user: user,
      company_name: "Profile Phone Co",
      phone: "832-555-0112",
      bio: "Search fixture"
    )
    user.update_columns(phone: nil, phone_normalized: nil)

    assert_includes AdminUserSearch.apply(User.where(role: :company), "832").pluck(:id), user.id
  end

  test "does not duplicate a user who matches on account and profile phone" do
    user = User.create!(
      email: "dup-phone-search@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Twice",
      last_name: "Match",
      phone: "+1 (832) 555-0113"
    )
    TechnicianProfile.create!(
      user: user,
      trade_type: "Electrician",
      availability: "Full-time",
      phone: "+1 (832) 555-0113"
    )

    ids = AdminUserSearch.apply(User.where(role: :technician), "832").pluck(:id)
    assert_equal 1, ids.count { |id| id == user.id }
  end

  test "treats LIKE wildcards and quotes in the query as literals" do
    user = User.create!(
      email: "literal-wild@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Safe",
      last_name: "Query",
      phone: "713-555-0114"
    )
    TechnicianProfile.create!(user: user, trade_type: "Electrician", availability: "Full-time", phone: user.phone)

    scope = User.where(role: :technician)
    refute_includes AdminUserSearch.apply(scope, "%").pluck(:id), user.id
    refute_includes AdminUserSearch.apply(scope, "832' OR 1=1 --").pluck(:id), user.id
    assert_equal User.count, User.count
  end
end
