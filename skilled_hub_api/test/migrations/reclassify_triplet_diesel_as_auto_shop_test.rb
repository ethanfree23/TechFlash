# frozen_string_literal: true

require "test_helper"
require Rails.root.join("db/migrate/20260821120000_reclassify_triplet_diesel_as_auto_shop").to_s

class ReclassifyTripletDieselAsAutoShopTest < ActiveSupport::TestCase
  test "is a no-op when Triplet Diesel is absent" do
    assert_nil CompanyProfile.find_by("LOWER(TRIM(company_name)) = ?", "triplet diesel")
    assert_nothing_raised { ReclassifyTripletDieselAsAutoShop.new.up }
  end

  test "reclassifies Triplet Diesel and open jobs" do
    owner = User.create!(
      email: "triplet-owner@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile = CompanyProfile.create!(
      user: owner,
      company_name: "Triplet Diesel",
      industry: "General Contracting",
      membership_level: "basic",
      service_trades: []
    )
    owner.update_column(:company_profile_id, profile.id)

    open_job = Job.create!(
      company_profile: profile,
      title: "Diesel repair",
      description: "desc",
      status: :open,
      trade_type: nil
    )
    finished_job = Job.create!(
      company_profile: profile,
      title: "Old job",
      description: "desc",
      status: :finished,
      trade_type: "Electrician"
    )

    ReclassifyTripletDieselAsAutoShop.new.up

    profile.reload
    assert_equal "Auto Shop", profile.industry
    assert_equal ["Automobile Technician"], profile.service_trades
    assert_equal "Automobile Technician", open_job.reload.trade_type
    assert_equal "Electrician", finished_job.reload.trade_type
  end
end
