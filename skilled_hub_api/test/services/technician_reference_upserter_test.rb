# frozen_string_literal: true

require "test_helper"

class TechnicianReferenceUpserterTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(
      email: "ref-upsert@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550102"
    )
    TechnicianProfile.create!(user: @user, trade_type: "Plumber", availability: "Full-time", phone: "7135550102")
  end

  test "creates a reference with name and email" do
    result = TechnicianReferenceUpserter.call(
      user: @user,
      attrs: { full_name: "Ada Lee", company: "Acme", email: "ada@example.com", phone: "7135558888" }
    )
    assert result.ok
    assert_equal 1, @user.verification_references_as_technician.count
  end

  test "duplicate phone or email is not duplicated" do
    TechnicianReferenceUpserter.call(user: @user, attrs: { full_name: "Ada Lee", email: "ada@example.com", phone: "7135558888" })
    result = TechnicianReferenceUpserter.call(user: @user, attrs: { full_name: "Ada Lee", email: "ada@example.com", phone: "7135558888" })
    assert result.ok
    assert_equal true, result.duplicate
    assert_equal 1, @user.verification_references_as_technician.count
  end

  test "name only is not persisted" do
    result = TechnicianReferenceUpserter.call(user: @user, attrs: { full_name: "Ada Lee" })
    refute result.ok
    assert_includes result.missing, "email or phone"
    assert_equal 0, @user.verification_references_as_technician.count
  end
end
