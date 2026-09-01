# frozen_string_literal: true

require "test_helper"

class TradeQualificationNormalizerTest < ActiveSupport::TestCase
  test "normalizes hashes and drops duplicates" do
    result = TradeQualificationNormalizer.normalize_list(
      [
        { trade_type: "electrician", skill_class: "Apprentice", experience_years: "1" },
        { "trade_type" => "Electrician", "skill_class" => "master", "experience_years" => 9 },
        { trade_type: "HVAC Technician", skill_class: "journeyman", experience_years: 4 }
      ]
    )

    assert_equal 2, result.length
    assert_equal "Electrician", result.first[:trade_type]
    assert_equal "apprentice", result.first[:skill_class]
    assert_equal 1, result.first[:experience_years]
    assert_equal "HVAC Technician", result.second[:trade_type]
  end

  test "from_scalars keeps additional trade details from previous qualifications" do
    result = TradeQualificationNormalizer.from_scalars(
      trade_type: "Electrician",
      skill_class: "apprentice",
      experience_years: 1,
      specialties: ["HVAC Technician"],
      previous: [
        { "trade_type" => "HVAC Technician", "skill_class" => "journeyman", "experience_years" => 6 }
      ]
    )

    assert_equal "Electrician", result.first[:trade_type]
    assert_equal "apprentice", result.first[:skill_class]
    assert_equal "HVAC Technician", result.second[:trade_type]
    assert_equal "journeyman", result.second[:skill_class]
    assert_equal 6, result.second[:experience_years]
  end

  test "apply_to_profile syncs legacy columns" do
    user = User.create!(
      email: "qual-normalizer@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    profile = TechnicianProfile.new(user: user, availability: "Full-time", phone: "7135550100")
    TradeQualificationNormalizer.apply_to_profile!(
      profile,
      [
        { trade_type: "Electrician", skill_class: "apprentice", experience_years: 2 },
        { trade_type: "Plumber", skill_class: "master", experience_years: 10 }
      ]
    )

    assert_equal "Electrician", profile.trade_type
    assert_equal "apprentice", profile.skill_class
    assert_equal 2, profile.experience_years
    assert_equal ["Electrician", "Plumber"], profile.specialties
  end
end
