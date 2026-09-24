# frozen_string_literal: true

require "test_helper"

class CompanyProfileBusinessZipTest < ActiveSupport::TestCase
  def build_profile(zip)
    user = User.create!(email: "bizzip-#{SecureRandom.hex(4)}@example.com", password: "CompanyPass1!",
                        password_confirmation: "CompanyPass1!", role: :company)
    CompanyProfile.new(user: user, company_name: "Zip Co", business_zip_code: zip,
                       membership_level: MembershipPolicy.default_slug_for("company"))
  end

  test "business ZIP normalizes to five digits" do
    { "77002" => "77002", " 77002 " => "77002", "77002-1234" => "77002", "Houston, TX 77019" => "77019" }.each do |raw, expected|
      profile = build_profile(raw)
      profile.valid?
      assert_equal expected, profile.business_zip_code, raw.inspect
    end
  end

  test "blank or malformed business ZIP becomes nil" do
    [nil, "", "   ", "7700", "abcde"].each do |raw|
      profile = build_profile(raw)
      profile.valid?
      assert_nil profile.business_zip_code, raw.inspect
    end
  end

  test "business ZIP does not change the location text" do
    profile = build_profile("77002")
    profile.location = "123 Main St, Houston, Texas 77007"
    profile.save!
    assert_equal "123 Main St, Houston, Texas 77007", profile.reload.location
    assert_equal "77002", profile.business_zip_code
  end

  test "apply_business_zip_place fills a blank city and full state name" do
    profile = build_profile("77002")
    assert profile.apply_business_zip_place!
    assert_equal "Houston", profile.location
    assert_equal "Texas", profile.state
  end

  test "apply_business_zip_place fills only the blank side" do
    profile = build_profile("77002")
    profile.location = "Midtown"
    assert profile.apply_business_zip_place!
    assert_equal "Midtown", profile.location
    assert_equal "Texas", profile.state
  end

  test "apply_business_zip_place leaves an unknown ZIP blank" do
    profile = build_profile("00000")
    profile.valid?
    refute profile.apply_business_zip_place!
    assert_nil profile.location
    assert_nil profile.state
  end
end
