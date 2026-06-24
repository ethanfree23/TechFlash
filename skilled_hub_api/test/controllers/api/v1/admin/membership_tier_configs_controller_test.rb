# frozen_string_literal: true

require "test_helper"
require "ostruct"

module Api
  module V1
    module Admin
      class MembershipTierConfigsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "admin lists technician tiers" do
          admin = User.create!(email: "admin-tier-list@example.com", password: "password123", password_confirmation: "password123", role: :admin)

          get "/api/v1/admin/membership_tier_configs?audience=technician", headers: auth_header_for(admin)

          assert_response :ok
          body = JSON.parse(response.body)
          assert_operator body["membership_tier_configs"].length, :>=, 3
          assert(body["membership_tier_configs"].any? { |c| c["slug"] == "basic" })
        end

        test "non admin is forbidden" do
          tech = User.create!(email: "tech-tier-list@example.com", password: "password123", password_confirmation: "password123", role: :technician)
          TechnicianProfile.create!(user: tech, trade_type: "General", availability: "Full-time")

          get "/api/v1/admin/membership_tier_configs?audience=company", headers: auth_header_for(tech)

          assert_response :forbidden
        end

        test "admin updates tier commission" do
          admin = User.create!(email: "admin-tier-patch@example.com", password: "password123", password_confirmation: "password123", role: :admin)
          tier = MembershipTierConfig.find_by!(audience: "company", slug: "pro")

          patch "/api/v1/admin/membership_tier_configs/#{tier.id}",
                params: { commission_percent: 4.25 },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          assert_in_delta 4.25, tier.reload.commission_percent.to_f, 0.001
        end

        test "admin cannot delete last tier for audience" do
          admin = User.create!(email: "admin-tier-del-last@example.com", password: "password123", password_confirmation: "password123", role: :admin)
          MembershipTierConfig.where(audience: "technician").delete_all
          solo = MembershipTierConfig.create!(
            audience: "technician",
            slug: "only",
            display_name: "Only",
            monthly_fee_cents: 0,
            yearly_fee_cents: 0,
            commission_percent: 10,
            early_access_delay_hours: 0,
            sort_order: 0,
            feature_bullets: [],
            active: true
          )

          delete "/api/v1/admin/membership_tier_configs/#{solo.id}", headers: auth_header_for(admin)

          assert_response :unprocessable_entity
        end

        test "admin cannot delete tier in use" do
          admin = User.create!(email: "admin-tier-del-use@example.com", password: "password123", password_confirmation: "password123", role: :admin)
          MembershipTierConfig.create!(
            audience: "technician",
            slug: "orphan_tier",
            display_name: "Orphan",
            monthly_fee_cents: 100,
            yearly_fee_cents: 0,
            commission_percent: 15,
            early_access_delay_hours: 12,
            sort_order: 99,
            feature_bullets: [],
            active: true
          )
          orphan = MembershipTierConfig.find_by!(audience: "technician", slug: "orphan_tier")
          user = User.create!(email: "tech-on-orphan@example.com", password: "password123", password_confirmation: "password123", role: :technician)
          TechnicianProfile.create!(
            user: user,
            trade_type: "General",
            availability: "Full-time",
            membership_level: "orphan_tier"
          )

          delete "/api/v1/admin/membership_tier_configs/#{orphan.id}", headers: auth_header_for(admin)

          assert_response :unprocessable_entity
          body = JSON.parse(response.body)
          assert_equal "tier_in_use", body["error_code"]
          assert_equal 1, body["total_assigned_users"]
          assert_equal "tech-on-orphan@example.com", body.dig("assigned_users", 0, "email")
        end

        test "admin transfers assignments to another tier" do
          admin = User.create!(email: "admin-tier-transfer@example.com", password: "password123", password_confirmation: "password123", role: :admin)
          source = MembershipTierConfig.create!(
            audience: "technician",
            slug: "transfer_src_#{SecureRandom.hex(2)}",
            display_name: "Transfer Source",
            monthly_fee_cents: 1000,
            yearly_fee_cents: 0,
            commission_percent: 10,
            early_access_delay_hours: 12,
            sort_order: 150,
            feature_bullets: [],
            active: true
          )
          target = MembershipTierConfig.create!(
            audience: "technician",
            slug: "transfer_dst_#{SecureRandom.hex(2)}",
            display_name: "Transfer Target",
            monthly_fee_cents: 1500,
            yearly_fee_cents: 0,
            commission_percent: 8,
            early_access_delay_hours: 6,
            sort_order: 151,
            feature_bullets: [],
            active: true
          )
          user = User.create!(email: "tech-transfer-src@example.com", password: "password123", password_confirmation: "password123", role: :technician)
          profile = TechnicianProfile.create!(
            user: user,
            trade_type: "General",
            availability: "Full-time",
            membership_level: source.slug
          )

          post "/api/v1/admin/membership_tier_configs/#{source.id}/transfer_assignments",
               params: { target_tier_id: target.id },
               headers: auth_header_for(admin),
               as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal 1, body["moved_count"]
          assert_equal target.slug, profile.reload.membership_level
        end

        test "admin provision_stripe creates price and returns ids" do
          admin = User.create!(email: "admin-provision-ok@example.com", password: "password123", password_confirmation: "password123", role: :admin)
          tier = MembershipTierConfig.create!(
            audience: "technician",
            slug: "provision_ok_#{SecureRandom.hex(2)}",
            display_name: "Provisioned",
            monthly_fee_cents: 100,
            yearly_fee_cents: 0,
            commission_percent: 1.0,
            early_access_delay_hours: 0,
            sort_order: 100,
            stripe_price_id: nil,
            feature_bullets: [],
            active: true
          )
          was_key = ENV["STRIPE_SECRET_KEY"]
          was_api = Stripe.api_key
          ENV["STRIPE_SECRET_KEY"] = "sk_test_x"
          Stripe.api_key = "sk_test_x"
          price_double = OpenStruct.new(id: "price_ct_1", product: "prod_ct_1")
          sclass = Stripe::Price.singleton_class
          sclass.alias_method :_orig_stripe_create, :create
          sclass.define_method(:create) { |*| price_double }
          begin
            post "/api/v1/admin/membership_tier_configs/#{tier.id}/provision_stripe",
                 headers: auth_header_for(admin)

            assert_response :ok
            body = JSON.parse(response.body)
            assert_equal "price_ct_1", body["stripe_price_id"]
            assert_equal "prod_ct_1", body["stripe_product_id"]
            assert_equal "price_ct_1", body.dig("membership_tier_config", "stripe_price_id")
            assert_equal "price_ct_1", tier.reload.stripe_price_id
          ensure
            sclass.remove_method :create
            sclass.alias_method :create, :_orig_stripe_create
            sclass.remove_method :_orig_stripe_create
            ENV["STRIPE_SECRET_KEY"] = was_key
            Stripe.api_key = was_api
            tier.destroy
            admin.destroy
          end
        end

        test "non admin cannot provision_stripe" do
          tech = User.create!(email: "tech-provision@example.com", password: "password123", password_confirmation: "password123", role: :technician)
          TechnicianProfile.create!(user: tech, trade_type: "General", availability: "Full-time")
          tier = MembershipTierConfig.find_by!(audience: "technician", slug: "pro")

          post "/api/v1/admin/membership_tier_configs/#{tier.id}/provision_stripe", headers: auth_header_for(tech)

          assert_response :forbidden
        end

        test "admin provision_stripe is unprocessable for free tier" do
          admin = User.create!(email: "admin-provision-free@example.com", password: "password123", password_confirmation: "password123", role: :admin)
          tier = MembershipTierConfig.find_by!(audience: "technician", slug: "basic")

          post "/api/v1/admin/membership_tier_configs/#{tier.id}/provision_stripe", headers: auth_header_for(admin)

          assert_response :unprocessable_entity
          body = JSON.parse(response.body)
          assert body["error"].present?
        end
      end
    end
  end
end
