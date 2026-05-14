# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class MembershipTierConfigsControllerTest < ActionDispatch::IntegrationTest
      test "lists only active technician tiers" do
        hidden_slug = "inactive_test_#{SecureRandom.hex(4)}"
        MembershipTierConfig.create!(
          audience: "technician",
          slug: hidden_slug,
          display_name: "Hidden",
          monthly_fee_cents: 0,
          yearly_fee_cents: 0,
          commission_percent: 10,
          early_access_delay_hours: 0,
          sort_order: 999,
          active: false,
          feature_bullets: []
        )

        get "/api/v1/membership_tier_configs?audience=technician"

        assert_response :ok
        body = JSON.parse(response.body)
        slugs = body["membership_tier_configs"].map { |c| c["slug"] }
        assert_not_includes slugs, hidden_slug
        sample = body["membership_tier_configs"].find { |c| c["slug"] == "basic" }
        assert sample
        assert_includes sample.keys, "yearly_fee_cents"
        assert_includes sample.keys, "feature_bullets"
        assert_includes sample.keys, "is_highlighted"
      end
    end
  end
end
