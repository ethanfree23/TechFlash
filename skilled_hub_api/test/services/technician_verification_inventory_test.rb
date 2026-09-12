# frozen_string_literal: true

require "test_helper"

class TechnicianVerificationInventoryTest < ActiveSupport::TestCase
  MINI_PNG = Base64.decode64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  ).b

  setup do
    @user = User.create!(
      email: "inv-tech@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "John",
      last_name: "Smith",
      phone: "7135550100"
    )
    @profile = TechnicianProfile.create!(
      user: @user,
      trade_type: "Electrician",
      availability: "Full-time",
      phone: "7135550100"
    )
  end

  test "complete document is YES" do
    doc = create_license!(issuer: "Texas Journeyman Electrician", attach: true)
    snapshot = TechnicianVerificationInventory.call(@user)
    assert_equal "yes", snapshot[:trade_license][:state]
    assert_equal true, snapshot[:trade_license][:complete]
    assert_equal doc.id, snapshot[:trade_license][:documents].first[:id]
  end

  test "claimed credential missing image is NO" do
    @profile.update!(has_trade_credential: true)
    create_license!(issuer: "Texas Journeyman Electrician", attach: false)
    snapshot = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "no", snapshot[:trade_license][:state]
    assert_includes snapshot[:trade_license][:missing], "license photo"
  end

  test "claimed credential missing title is NO" do
    @profile.update!(has_trade_credential: true)
    create_license!(issuer: "Trade license", attach: true)
    snapshot = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "no", snapshot[:trade_license][:state]
    assert_includes snapshot[:trade_license][:missing], "document title"
  end

  test "explicit false with no document is N/A" do
    @profile.update!(has_trade_credential: false)
    snapshot = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "na", snapshot[:trade_license][:state]
    assert_equal false, snapshot[:trade_license][:complete]
  end

  test "nil with no document is UNKNOWN" do
    snapshot = TechnicianVerificationInventory.call(@user)
    assert_nil @profile.has_trade_credential
    assert_equal "unknown", snapshot[:trade_license][:state]
  end

  test "document overrides prior false" do
    @profile.update!(has_trade_credential: false)
    create_license!(issuer: "OSHA 30", attach: true)
    snapshot = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "yes", snapshot[:trade_license][:state]
  end

  test "reference counts 0 through 3+" do
    assert_equal 0, TechnicianVerificationInventory.call(@user)[:professional_references][:count]
    create_references!(1)
    assert_equal 1, TechnicianVerificationInventory.call(@user.reload)[:professional_references][:count]
    assert_equal 2, TechnicianVerificationInventory.call(@user)[:professional_references][:missing_count]
    create_references!(2)
    snap2 = TechnicianVerificationInventory.call(@user.reload)
    assert_equal 2, snap2[:professional_references][:count]
    assert_equal false, snap2[:professional_references][:complete]
    create_references!(3)
    snap3 = TechnicianVerificationInventory.call(@user.reload)
    assert_equal 3, snap3[:professional_references][:count]
    assert_equal true, snap3[:professional_references][:complete]
    create_references!(4)
    snap4 = TechnicianVerificationInventory.call(@user.reload)
    assert_equal 4, snap4[:professional_references][:count]
    assert_equal "3+", snap4[:professional_references][:display_count]
    assert_equal true, snap4[:professional_references][:complete]
  end

  test "background check mappings" do
    none = TechnicianVerificationInventory.call(@user)
    assert_equal "not_started", none[:background_check][:state]
    assert_equal "Incomplete", none[:background_check][:label]
    assert_equal "incomplete", none[:background_check][:color_bucket]

    create_check!(normalized_status: "invitation_sent")
    sent = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "Invitation sent", sent[:background_check][:label]
    assert_equal "processing", sent[:background_check][:color_bucket]

    BackgroundCheck.delete_all
    create_check!(normalized_status: "report_pending", status: :processing)
    processing = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "In progress", processing[:background_check][:label]

    BackgroundCheck.delete_all
    create_check!(normalized_status: "clear", status: :clear, completed_at: Time.current)
    clear = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "Clear", clear[:background_check][:label]
    assert_equal "passed", clear[:background_check][:color_bucket]
    assert_equal true, clear[:background_check][:complete]

    BackgroundCheck.delete_all
    create_check!(normalized_status: "consider", status: :consider)
    consider = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "Consider", consider[:background_check][:label]
    assert_equal "review", consider[:background_check][:color_bucket]
    refute consider[:background_check][:complete]

    BackgroundCheck.delete_all
    create_check!(normalized_status: "canceled", status: :failed)
    canceled = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "Canceled", canceled[:background_check][:label]

    BackgroundCheck.delete_all
    create_check!(normalized_status: "invitation_sent", admin_override_status: :manually_approved)
    overridden = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "Clear", overridden[:background_check][:label]
    assert_equal "passed", overridden[:background_check][:color_bucket]
  end

  test "technician-actionable gaps exclude processing background checks" do
    @profile.update!(has_trade_credential: false)
    create_references!(3)
    create_check!(normalized_status: "report_pending", status: :processing)
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal true, snap[:collection_complete]
    assert_equal false, snap[:technician_actionable]
    assert_equal [], snap[:actionable_missing]
    assert_equal "wait", snap[:background_check][:technician_action]
  end

  test "invitation sent remains technician-actionable" do
    create_check!(normalized_status: "invitation_sent", invitation_url: "https://apply.checkr.com/invite/test")
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal true, snap[:background_check][:technician_actionable]
    assert_equal "complete_invitation", snap[:background_check][:technician_action]
    assert_equal "https://apply.checkr.com/invite/test", snap[:background_check][:details][:invitation_url]
  end

  test "consider needs human and is not technician-actionable" do
    @profile.update!(has_trade_credential: false)
    create_references!(3)
    create_check!(normalized_status: "consider", status: :consider)
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal true, snap[:needs_human]
    assert_equal false, snap[:technician_actionable]
    assert_equal false, snap[:collection_complete]
  end

  test "suggested sms comes from inventory gaps" do
    @profile.update!(has_trade_credential: true)
    sms = TechnicianVerificationInventory.call(@user.reload)[:suggested_sms]
    assert_match(/John/, sms[:trade_license])
    assert_match(/3 professional references/, sms[:professional_references])
    assert_match(/background check/, sms[:background_check])
    assert_equal sms[:trade_license], sms[:next_gap]
  end

  test "company users return nil" do
    company = User.create!(
      email: "inv-co@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      phone: "7135550199"
    )
    CompanyProfile.create!(user: company, company_name: "Acme")
    assert_nil TechnicianVerificationInventory.call(company)
  end

  private

  def create_license!(issuer:, attach:)
    doc = @profile.documents.create!(
      doc_type: "certificate",
      status: :pending_review,
      issuer: issuer,
      document_number: attach ? "123" : nil
    )
    if attach
      doc.file.attach(io: StringIO.new(MINI_PNG), filename: "license.png", content_type: "image/png")
    end
    doc
  end

  def create_references!(count)
    existing = @user.verification_references_as_technician.count
    (existing + 1).upto(count) do |i|
      @user.verification_references_as_technician.create!(
        full_name: "Ref #{i}",
        email: "ref#{i}-#{@user.id}@example.com",
        phone: "713555#{format('%04d', i)}",
        company_name: "Co #{i}",
        relationship: "Supervisor"
      )
    end
  end

  def create_check!(attrs)
    BackgroundCheck.create!(
      {
        user: @user,
        provider: "checkr",
        paid_by: "technician",
        status: :not_started
      }.merge(attrs)
    )
  end
end
