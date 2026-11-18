# frozen_string_literal: true

require "test_helper"

class TechnicianActivationTest < ActiveSupport::TestCase
  test "ensure_for creates default new activation for technician" do
    tech = User.create!(
      email: "tech+activation_model@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    TechnicianProfile.create!(user: tech, trade_type: "Plumber", phone: "5550001111")

    activation = TechnicianActivation.ensure_for!(tech)
    assert_equal "new", activation.status
    assert_equal "unknown", activation.current_availability
    assert_equal activation.id, TechnicianActivation.ensure_for!(tech).id
  end

  test "rejects non-technician users" do
    admin = User.create!(
      email: "admin+activation_model@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin
    )
    assert_raises(ArgumentError) { TechnicianActivation.ensure_for!(admin) }
  end

  test "accepts has_a_job availability" do
    tech = User.create!(
      email: "tech+has_a_job@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    TechnicianProfile.create!(user: tech, trade_type: "Electrician", phone: "5550002222")

    activation = TechnicianActivation.ensure_for!(tech)
    activation.update!(current_availability: "has_a_job")
    assert_equal "has_a_job", activation.reload.current_availability
  end
end
