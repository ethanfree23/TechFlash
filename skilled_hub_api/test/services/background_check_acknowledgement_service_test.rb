# frozen_string_literal: true

require "test_helper"

class BackgroundCheckAcknowledgementServiceTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(
      email: "bg-ack-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Ack",
      last_name: "Test"
    )
  end

  test "persists acceptance with actor version and timestamp" do
    row = BackgroundCheckAcknowledgementService.upsert!(
      user: @user,
      acknowledgement_type: BackgroundCheckAcknowledgement::PLATFORM_NOTICE,
      accepted: true,
      actor_user: @user,
      ip_address: "127.0.0.1",
      user_agent: "TestAgent"
    )

    assert row.accepted?
    assert row.accepted_at.present?
    assert_equal @user.id, row.actor_user_id
    assert_equal BackgroundCheckAcknowledgement.current_version_for(BackgroundCheckAcknowledgement::PLATFORM_NOTICE), row.document_version
    assert_equal "127.0.0.1", row.ip_address
  end

  test "unchecking clears acceptance without inventing consent" do
    BackgroundCheckAcknowledgementService.upsert!(
      user: @user,
      acknowledgement_type: BackgroundCheckAcknowledgement::SCREENING_PROCESS,
      accepted: true,
      actor_user: @user
    )
    row = BackgroundCheckAcknowledgementService.upsert!(
      user: @user,
      acknowledgement_type: BackgroundCheckAcknowledgement::SCREENING_PROCESS,
      accepted: false,
      actor_user: @user
    )
    refute row.accepted?
    assert_nil row.accepted_at
  end

  test "required_accepted requires both current versions" do
    refute BackgroundCheckAcknowledgement.required_accepted?(@user)
    BackgroundCheckAcknowledgementService.upsert!(
      user: @user,
      acknowledgement_type: BackgroundCheckAcknowledgement::PLATFORM_NOTICE,
      accepted: true,
      actor_user: @user
    )
    refute BackgroundCheckAcknowledgement.required_accepted?(@user)
    BackgroundCheckAcknowledgementService.upsert!(
      user: @user,
      acknowledgement_type: BackgroundCheckAcknowledgement::SCREENING_PROCESS,
      accepted: true,
      actor_user: @user
    )
    assert BackgroundCheckAcknowledgement.required_accepted?(@user)
  end
end
