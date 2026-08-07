require "test_helper"

class CheckrReconciliationServiceTest < ActiveSupport::TestCase
  test "skips when checkr client is not configured" do
    fake_client = Object.new
    fake_client.define_singleton_method(:configured?) { false }

    original_new = CheckrClient.method(:new)
    CheckrClient.singleton_class.send(:define_method, :new) { fake_client }

    result = CheckrReconciliationService.new.run
    assert_equal true, result[:skipped]
    assert_equal "checkr_not_configured", result[:reason]
  ensure
    CheckrClient.singleton_class.send(:define_method, :new, original_new)
  end

  test "reconciles stale report pending check from checkr report state" do
    user = User.create!(
      email: "reconcile-tech@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    TechnicianProfile.create!(
      user: user,
      trade_type: "Electrical",
      availability: "Full-time",
      membership_level: "basic",
      phone: "5551234567"
    )
    check = BackgroundCheck.create!(
      user: user,
      provider: "checkr",
      provider_report_id: "rep_reconcile_1",
      package_name: "essential_plus",
      status: :pending,
      normalized_status: "report_pending",
      payment_status: :paid,
      paid_by: "technician"
    )

    fake_client = Object.new
    fake_client.define_singleton_method(:configured?) { true }
    fake_client.define_singleton_method(:get_report) do |report_id:|
      if report_id == "rep_reconcile_1"
        {
          "id" => "rep_reconcile_1",
          "object" => "report",
          "status" => "complete",
          "result" => "clear",
          "candidate_id" => "cand_reconcile_1",
          "updated_at" => Time.current.iso8601
        }
      else
        raise CheckrClient::Error, "not found"
      end
    end
    fake_client.define_singleton_method(:get_invitation) { |_invitation_id:| raise CheckrClient::Error, "not found" }

    original_new = CheckrClient.method(:new)
    CheckrClient.singleton_class.send(:define_method, :new) { fake_client }

    result = CheckrReconciliationService.new(stale_hours: 0, limit: 20).run
    assert_equal false, result[:skipped]
    assert_equal 1, result[:processed]
    assert_equal 1, result[:reconciled]

    check.reload
    assert_equal "clear", check.normalized_status
    assert_equal "complete", check.provider_status
    assert_equal "clear", check.result
  ensure
    CheckrClient.singleton_class.send(:define_method, :new, original_new)
  end
end
