# frozen_string_literal: true

require "test_helper"

class GhlTechnicianOnboardingServiceTest < ActiveSupport::TestCase
  setup do
    ActionMailer::Base.deliveries.clear
  end

  test "creates user with password digest and does not send mail" do
    result = GhlTechnicianOnboardingService.call(payload)

    assert_equal :accepted, result.http_status
    user = User.find(result.body[:user_id])
    assert user.password_digest.present?
    assert_equal "system", user.password_set_by
    assert_equal 0, ActionMailer::Base.deliveries.size
    refute result.body.key?(:token)
    refute result.body.key?(:password)
  end

  test "admin phone collision returns conflict" do
    User.create!(
      email: "admin-collide@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin,
      phone: "7135557777"
    )

    result = GhlTechnicianOnboardingService.call(
      payload.merge(
        "ghl_contact_id" => "admin-phone",
        "idempotency_key" => "admin-phone",
        "email" => "fresh-admin-phone@example.com",
        "phone" => "7135557777"
      )
    )

    assert_equal :conflict, result.http_status
  end

  test "failed attempt can retry successfully" do
    first = GhlTechnicianOnboardingService.call(
      payload.merge(
        "ghl_contact_id" => "retry-later",
        "idempotency_key" => "retry-later",
        "email" => "",
        "tf_intake_contact_info" => "77002"
      )
    )
    assert_equal :unprocessable_entity, first.http_status

    second = GhlTechnicianOnboardingService.call(
      payload.merge(
        "ghl_contact_id" => "retry-later",
        "idempotency_key" => "retry-later",
        "email" => "retry-later@example.com"
      )
    )

    assert_equal :accepted, second.http_status
    assert_equal true, second.body[:created]
  end

  test "same references do not duplicate on a later idempotency key" do
    GhlTechnicianOnboardingService.call(payload.merge("ghl_contact_id" => "refs-1", "idempotency_key" => "refs-1"))
    user = User.find_by(ghl_contact_id: "refs-1")
    assert_equal 3, user.verification_references_as_technician.count

    GhlTechnicianOnboardingService.call(payload.merge("ghl_contact_id" => "refs-1", "idempotency_key" => "refs-2"))
    assert_equal 3, user.reload.verification_references_as_technician.count
  end

  private

  def payload
    {
      "ghl_contact_id" => "svc123",
      "ghl_location_id" => "loc123",
      "ghl_conversation_id" => "conv123",
      "idempotency_key" => "svc123",
      "phone" => "+17135551234",
      "email" => "svc@example.com",
      "first_name" => "John",
      "last_name" => "Smith",
      "tf_intake_contact_info" => "svc@example.com / 77002",
      "tf_intake_references" => "1. Sam Jones, 7135551111, ABC Plumbing, supervisor; 2. Mike Lee, 7135552222; 3. Chris Brown, 7135553333, coworker"
    }
  end
end
