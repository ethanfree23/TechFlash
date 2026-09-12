# frozen_string_literal: true

require "test_helper"
require_relative "../support/ai_sms_test_helper"

class AiActionExecutorTest < ActiveSupport::TestCase
  include AiSmsTestHelper

  setup do
    @user = create_ai_tech!(email: "ai-exec@example.com", contact_id: "contact-exec")
    @other = create_ai_tech!(email: "ai-exec-other@example.com", contact_id: "contact-other")
    @session = AiSmsSession.create!(
      user: @user,
      purpose: "technician_verification",
      status: "waiting_for_reply",
      started_at: Time.current,
      ghl_contact_id: "contact-exec"
    )
  end

  test "unknown says no persists N/A" do
    inventory = TechnicianVerificationInventory.call(@user)
    result = Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "set_trade_credential_presence", "has_trade_credential" => false }]
    )
    assert_equal 1, result.accepted.size
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "na", snap[:trade_license][:state]
  end

  test "unknown says yes then asks for details via remaining inventory" do
    inventory = TechnicianVerificationInventory.call(@user)
    Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "set_trade_credential_presence", "has_trade_credential" => true }]
    )
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "no", snap[:trade_license][:state]
    assert_includes snap[:trade_license][:missing], "credential documentation"
  end

  test "title and inbound image become YES" do
    inventory = TechnicianVerificationInventory.call(@user)
    GhlRemoteImageFetcher.stub(:fetch, fetched_png) do
      Ai::ActionExecutor.call(
        user: @user,
        session: @session,
        inventory: inventory,
        actions: [{ "type" => "save_trade_license_details", "title" => "Texas Journeyman", "photo_url" => "https://services.msgsndr.com/mms/photo.png" }],
        inbound_urls: ["https://services.msgsndr.com/mms/photo.png"]
      )
    end
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "yes", snap[:trade_license][:state]
  end

  test "title only asks image via inventory" do
    inventory = TechnicianVerificationInventory.call(@user)
    Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "save_trade_license_details", "title" => "Texas Journeyman" }]
    )
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_includes snap[:trade_license][:missing], "license photo"
  end

  test "rejects photo URL that was not inbound" do
    inventory = TechnicianVerificationInventory.call(@user)
    result = Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "attach_trade_license_photo", "photo_url" => "https://evil.example/x.png" }],
      inbound_urls: ["https://services.msgsndr.com/mms/photo.png"]
    )
    assert result.accepted.blank?
    assert_equal "attach_trade_license_photo", result.rejected.first["type"]
  end

  test "invalid action type is rejected" do
    inventory = TechnicianVerificationInventory.call(@user)
    result = Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "drop_table", "reason" => "nope" }]
    )
    assert_equal "unsupported action", result.rejected.first["rejected_reason"]
  end

  test "references increment toward 3 and skip when complete" do
    inventory = TechnicianVerificationInventory.call(@user)
    Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [
        { "type" => "save_professional_reference", "full_name" => "Ref One", "email" => "r1@example.com", "phone" => "7135551001", "company" => "Co 1" }
      ]
    )
    assert_equal 1, @user.verification_references_as_technician.count

    2.upto(3) do |i|
      inventory = TechnicianVerificationInventory.call(@user.reload)
      Ai::ActionExecutor.call(
        user: @user,
        session: @session,
        inventory: inventory,
        actions: [{ "type" => "save_professional_reference", "full_name" => "Ref #{i}", "email" => "r#{i}@example.com", "phone" => "713555100#{i}" }]
      )
    end
    assert_equal 3, @user.verification_references_as_technician.count

    inventory = TechnicianVerificationInventory.call(@user.reload)
    result = Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "save_professional_reference", "full_name" => "Ref Extra", "email" => "extra@example.com" }]
    )
    assert_equal "reference target already met", result.rejected.first["rejected_reason"]
    assert_equal 3, @user.verification_references_as_technician.count
  end

  test "duplicate reference is not duplicated" do
    inventory = TechnicianVerificationInventory.call(@user)
    2.times do
      Ai::ActionExecutor.call(
        user: @user,
        session: @session,
        inventory: inventory,
        actions: [{ "type" => "save_professional_reference", "full_name" => "Ada Lee", "email" => "ada@example.com", "phone" => "7135557777" }]
      )
    end
    assert_equal 1, @user.verification_references_as_technician.count
  end

  test "cross-user ownership stays on the session technician" do
    inventory = TechnicianVerificationInventory.call(@user)
    Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "save_professional_reference", "full_name" => "Ada Lee", "email" => "ada-cross@example.com" }]
    )
    assert_equal 1, @user.verification_references_as_technician.count
    assert_equal 0, @other.verification_references_as_technician.count
  end

  test "background reminder allowed when incomplete" do
    inventory = TechnicianVerificationInventory.call(@user)
    result = Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "send_background_check_reminder" }]
    )
    assert_equal 1, result.accepted.size
    assert_equal "send_background_check_reminder", result.accepted.first["type"]
  end

  test "background reminder rejected while processing" do
    BackgroundCheck.create!(user: @user, provider: "checkr", paid_by: "technician", status: :processing, normalized_status: "report_pending")
    inventory = TechnicianVerificationInventory.call(@user.reload)
    result = Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "send_background_check_reminder" }]
    )
    assert_equal "background check is not technician-actionable", result.rejected.first["rejected_reason"]
  end

  test "consider sets needs_human" do
    inventory = TechnicianVerificationInventory.call(@user)
    result = Ai::ActionExecutor.call(
      user: @user,
      session: @session,
      inventory: inventory,
      actions: [{ "type" => "needs_human", "reason" => "background review" }]
    )
    assert_equal true, result.needs_human
  end
end
