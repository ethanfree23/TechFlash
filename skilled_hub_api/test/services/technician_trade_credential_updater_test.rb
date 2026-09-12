# frozen_string_literal: true

require "test_helper"

class TechnicianTradeCredentialUpdaterTest < ActiveSupport::TestCase
  MINI_PNG = Base64.decode64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  ).b

  setup do
    @user = User.create!(
      email: "cred-updater@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550101"
    )
    @profile = TechnicianProfile.create!(user: @user, trade_type: "Electrician", availability: "Full-time", phone: "7135550101")
  end

  test "set presence false becomes N/A" do
    TechnicianTradeCredentialUpdater.set_presence!(profile: @profile, has_credential: false)
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "na", snap[:trade_license][:state]
  end

  test "title only leaves license incomplete" do
    TechnicianTradeCredentialUpdater.save_details!(profile: @profile, title: "Texas Journeyman Electrician")
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "no", snap[:trade_license][:state]
    assert_includes snap[:trade_license][:missing], "license photo"
  end

  test "title and image become YES" do
    fetched = GhlRemoteImageFetcher::Result.new(
      io: StringIO.new(MINI_PNG),
      content_type: "image/png",
      filename: "license.png",
      bytesize: MINI_PNG.bytesize
    )
    TechnicianTradeCredentialUpdater.save_details!(profile: @profile, title: "Texas Journeyman Electrician", image: fetched)
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "yes", snap[:trade_license][:state]
  end

  test "does not invent a document number" do
    TechnicianTradeCredentialUpdater.save_details!(profile: @profile, title: "OSHA 30")
    doc = @profile.documents.last
    assert_nil doc.document_number
  end
end
