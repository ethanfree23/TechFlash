# frozen_string_literal: true

require "test_helper"
require "ostruct"

class MembershipSubscriptionServiceTest < ActiveSupport::TestCase
  test "price_id_for prefers MembershipTierConfig stripe_price_id" do
    cfg = MembershipTierConfig.find_by!(audience: "technician", slug: "pro")
    before = cfg.stripe_price_id
    cfg.update!(stripe_price_id: "price_configured_abc")

    result = MembershipSubscriptionService.price_id_for(role: "technician", level: "pro")
    assert_equal "price_configured_abc", result
  ensure
    cfg.update!(stripe_price_id: before) if cfg
  end

  test "price_id_for falls back to ENV when config has no stripe_price_id" do
    cfg = MembershipTierConfig.find_by!(audience: "technician", slug: "pro")
    before = cfg.stripe_price_id
    key = MembershipSubscriptionService::PRICE_ENV_KEYS["technician"]["pro"]
    was_env = ENV[key]
    cfg.update!(stripe_price_id: nil)
    ENV[key] = "price_from_env_xyz"

    result = MembershipSubscriptionService.price_id_for(role: "technician", level: "pro")
    assert_equal "price_from_env_xyz", result
  ensure
    cfg.update!(stripe_price_id: before) if cfg
    if was_env.nil?
      ENV.delete(key)
    else
      ENV[key] = was_env
    end
  end

  test "level_from_subscription resolves slug via MembershipTierConfig stripe_price_id" do
    user = User.create!(email: "mss-map@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    TechnicianProfile.create!(user: user, trade_type: "General", availability: "Full-time", membership_level: "basic")

    cfg = MembershipTierConfig.create!(
      audience: "technician",
      slug: "mss_slug_#{SecureRandom.hex(2)}",
      display_name: "MSS",
      monthly_fee_cents: 500,
      commission_percent: 5.0,
      early_access_delay_hours: 0,
      sort_order: 100,
      stripe_price_id: "price_mss_999"
    )

    price = OpenStruct.new(id: "price_mss_999")
    line = OpenStruct.new(price: price)
    items = OpenStruct.new(data: [line])
    subscription = OpenStruct.new(items: items)

    level = MembershipSubscriptionService.send(:level_from_subscription, user: user, subscription: subscription)
    assert_equal cfg.slug, level
  ensure
    user&.destroy
    cfg&.destroy
  end

  MembershipSubscriptionService::PAID_ACCESS_STATUSES.each do |status|
    test "sync_from_subscription grants the price tier for #{status} subscriptions" do
      user, profile = build_subscriber(role: :technician, customer_id: "cus_sync_#{status}")
      with_price("technician", "pro", "price_sync_#{status}") do
        MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_#{status}", customer: "cus_sync_#{status}", status: status, price_id: "price_sync_#{status}"))
      end

      profile.reload
      assert_equal "pro", profile.membership_level
      assert_equal status, profile.membership_status
      assert_equal "sub_#{status}", profile.stripe_membership_subscription_id
      assert profile.membership_current_period_end_at.present?
    ensure
      user&.destroy
    end
  end

  %w[incomplete incomplete_expired unpaid canceled paused].each do |status|
    test "sync_from_subscription keeps the default tier for #{status} subscriptions" do
      user, profile = build_subscriber(role: :technician, customer_id: "cus_sync_#{status}")
      profile.update!(membership_level: "pro", membership_status: "active")
      with_price("technician", "pro", "price_sync_#{status}") do
        MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_#{status}", customer: "cus_sync_#{status}", status: status, price_id: "price_sync_#{status}"))
      end

      profile.reload
      assert_equal "basic", profile.membership_level
      assert_equal status, profile.membership_status
      assert_equal "sub_#{status}", profile.stripe_membership_subscription_id
    ensure
      user&.destroy
    end
  end

  test "sync_from_subscription applies the same status gate to company profiles" do
    user, profile = build_subscriber(role: :company, customer_id: "cus_sync_company")
    with_price("company", "premium", "price_sync_company_premium") do
      MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_co_1", customer: "cus_sync_company", status: "active", price_id: "price_sync_company_premium"))
      assert_equal "premium", profile.reload.membership_level

      MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_co_1", customer: "cus_sync_company", status: "canceled", price_id: "price_sync_company_premium"))
      profile.reload
      assert_equal "basic", profile.membership_level
      assert_equal "canceled", profile.membership_status
    end
  ensure
    user&.destroy
  end

  test "sync_from_subscription does not invent a tier for an unknown price" do
    user, profile = build_subscriber(role: :technician, customer_id: "cus_sync_unknown_price")
    MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_unknown", customer: "cus_sync_unknown_price", status: "active", price_id: "price_nobody_configured"))

    profile.reload
    assert_equal "basic", profile.membership_level
    assert_equal "active", profile.membership_status
  ensure
    user&.destroy
  end

  test "sync_from_subscription updates a legacy profile that would fail unrelated validations" do
    user, profile = build_subscriber(role: :technician, customer_id: "cus_sync_legacy_phone")
    profile.update_column(:phone, nil)
    refute profile.reload.valid?(:update), "fixture must be invalid on update to prove the targeted write"

    with_price("technician", "pro", "price_sync_legacy") do
      assert_nothing_raised do
        MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_legacy", customer: "cus_sync_legacy_phone", status: "active", price_id: "price_sync_legacy"))
      end
    end

    profile.reload
    assert_equal "pro", profile.membership_level
    assert_equal "active", profile.membership_status
    assert_equal "sub_legacy", profile.stripe_membership_subscription_id
    assert_nil profile.phone, "unrelated columns are untouched"
  ensure
    user&.destroy
  end

  test "sync_from_subscription still normalizes the level without validation callbacks" do
    user, profile = build_subscriber(role: :technician, customer_id: "cus_sync_normalize")
    MembershipSubscriptionService.stub(:level_from_subscription, "PRO") do
      MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_norm", customer: "cus_sync_normalize", status: "active", price_id: "price_any"))
    end
    assert_equal "pro", profile.reload.membership_level
  ensure
    user&.destroy
  end

  test "sync_from_subscription ignores subscriptions for unknown customers" do
    assert_nothing_raised do
      MembershipSubscriptionService.sync_from_subscription(subscription_struct(id: "sub_nobody", customer: "cus_nobody", status: "active", price_id: "price_x"))
    end
  end

  private

  def build_subscriber(role:, customer_id:)
    user = User.create!(email: "mss-#{role}-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: role)
    user.update_column(:stripe_customer_id, customer_id)
    profile =
      if role == :company
        CompanyProfile.create!(user: user, membership_level: "basic", phone: "713-555-0100").tap { |cp| user.update_column(:company_profile_id, cp.id) }
      else
        TechnicianProfile.create!(user: user, trade_type: "General", availability: "Full-time", membership_level: "basic", phone: "713-555-0199")
      end
    [user, profile]
  end

  def subscription_struct(id:, customer:, status:, price_id:)
    price = OpenStruct.new(id: price_id)
    item = OpenStruct.new(price: price)
    OpenStruct.new(
      id: id,
      customer: customer,
      status: status,
      current_period_end: 30.days.from_now.to_i,
      items: OpenStruct.new(data: [item])
    )
  end

  def with_price(audience, slug, price_id)
    cfg = MembershipTierConfig.find_by!(audience: audience, slug: slug)
    before = cfg.stripe_price_id
    cfg.update!(stripe_price_id: price_id)
    yield
  ensure
    cfg&.update!(stripe_price_id: before)
  end
end
