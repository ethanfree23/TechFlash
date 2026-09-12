# frozen_string_literal: true

require "test_helper"
require_relative "../support/ai_sms_test_helper"

class AiTechnicianVerificationStarterTest < ActiveSupport::TestCase
  include AiSmsTestHelper

  setup do
    @user = create_ai_tech!(email: "ai-start@example.com", contact_id: "contact-start")
    stub_ai!("reply" => "Hey John — do you currently hold a trade license or certification?", "needs_human" => false, "actions" => [{ "type" => "no_action" }])
  end

  teardown do
    Ai::Client.reset_adapter!
  end

  test "starts from canonical inventory and sends through Ghl::SmsSender" do
    captured = nil
    fake = sent_sms
    Ghl::SmsSender.stub(:call, ->(**kwargs) { captured = kwargs; fake }) do
      result = Ai::TechnicianVerificationStarter.call(user: @user)
      assert result.ok, result.error
      assert_equal false, result.resumed
      assert_equal "waiting_for_reply", result.session.status
      assert_equal fake.conversation_id, result.session.ghl_conversation_id
      assert_equal "ai_technician_verification", captured[:context]
      assert_match(/trade license/i, captured[:message])
    end
    assert_equal 1, AiSmsSession.live.where(user_id: @user.id).count
  end

  test "does not start when nothing technician-actionable remains" do
    @user.technician_profile.update!(has_trade_credential: false)
    3.times do |i|
      @user.verification_references_as_technician.create!(
        full_name: "Ref #{i}",
        email: "ref#{i}-start@example.com",
        phone: "713555#{format('%04d', i + 10)}",
        relationship: "Supervisor"
      )
    end
    BackgroundCheck.create!(user: @user, provider: "checkr", paid_by: "technician", status: :processing, normalized_status: "report_pending")

    result = Ai::TechnicianVerificationStarter.call(user: @user)
    refute result.ok
    assert_equal "collection_complete", result.status
    assert_equal 0, AiSmsSession.where(user_id: @user.id).count
  end

  test "cannot create a second live session" do
    Ghl::SmsSender.stub(:call, sent_sms) do
      first = Ai::TechnicianVerificationStarter.call(user: @user)
      assert first.ok
      second = Ai::TechnicianVerificationStarter.call(user: @user)
      assert second.ok
      assert_equal true, second.resumed
      assert_equal first.session.id, second.session.id
      assert_equal 1, AiSmsSession.live.where(user_id: @user.id).count
    end
  end

  test "opted-out technicians cannot start a new bot" do
    SmsDeliveryLog.create!(
      user: @user,
      category: "admin_manual",
      destination: "+17135552222",
      message: "hi",
      status: "skipped_opt_out",
      provider: "ghl"
    )
    result = Ai::TechnicianVerificationStarter.call(user: @user)
    refute result.ok
    assert_match(/opted out/i, result.error)
  end
end
