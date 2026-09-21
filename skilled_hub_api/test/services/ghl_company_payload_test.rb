# frozen_string_literal: true

require "test_helper"

class GhlCompanyPayloadTest < ActiveSupport::TestCase
  def parse(overrides = {})
    GhlCompanyPayload.parse({
      "idempotency_key" => "k", "ghl_contact_id" => "c", "ghl_location_id" => "l", "phone" => "7135550101"
    }.merge(overrides))
  end

  test "required keys" do
    assert_equal [], parse.missing_required_keys
    assert_equal %w[ghl_contact_id phone], parse("ghl_contact_id" => " ", "phone" => nil).missing_required_keys
  end

  test "unknown keys are dropped" do
    payload = parse("password" => "hunter2", "role" => "admin", "zip_code" => "77002")
    refute payload.raw.key?("password")
    refute payload.raw.key?("role")
    refute payload.raw.key?("zip_code")
  end

  test "email and phone are normalized" do
    payload = parse("email" => "  Owner@Example.COM ", "phone" => "+1 (713) 555-0101")
    assert_equal "owner@example.com", payload.email
    assert_equal "7135550101", payload.phone_normalized
  end

  test "full_name is split when first/last are absent" do
    payload = parse("full_name" => "Dana Marie Reyes")
    assert_equal "Dana", payload.first_name
    assert_equal "Marie Reyes", payload.last_name
  end

  test "business ZIP extracts five digits and warns on garbage" do
    assert_equal "77002", parse("business_zip" => "77002-1234").business_zip_code
    bad = parse("business_zip" => "not a zip")
    assert_nil bad.business_zip_code
    assert(bad.warnings.any? { |w| w.include?("business_zip") })
  end

  test "trades normalize to TradeCatalog labels and keep unknowns raw" do
    payload = parse("primary_trade" => "hvac", "trades_needed" => "Plumbing, Underwater Basket Weaving")
    assert_equal ["HVAC Technician", "Plumber"], payload.service_trades
    assert_equal "HVAC Technician", payload.industry
    assert_equal ["hvac", "Plumbing", "Underwater Basket Weaving"], payload.hiring_context["trades_needed"]
    assert(payload.warnings.any? { |w| w.include?("Underwater") })
  end

  test "trades_needed accepts an array" do
    assert_equal ["Electrician"], parse("trades_needed" => ["electrical"]).service_trades
  end

  test "staffing type aliases" do
    { "Temporary" => "temporary", "temp-to-hire" => "both", "Full Time" => "full_time",
      "permanent" => "full_time", "BOTH" => "both", nil => nil }.each do |raw, expected|
      assert_equal expected, parse("staffing_type" => raw).staffing_intent, raw.inspect
    end
  end

  test "hiring context parses counts, pay, and level" do
    ctx = parse("technicians_needed" => "3", "pay_min" => "$28", "pay_max" => "35.50",
                "technician_level" => "master", "hiring_timeframe" => "ASAP").hiring_context
    assert_equal 3, ctx["technicians_needed"]
    refute ctx.key?("technicians_needed_raw")
    assert_equal 2800, ctx["pay_min_cents"]
    assert_equal 3550, ctx["pay_max_cents"]
    assert_equal "master", ctx["technician_level"]
    assert_equal "ASAP", ctx["hiring_timeframe"]
  end

  test "range-like technicians_needed keeps the raw text" do
    ctx = parse("technicians_needed" => "5-10").hiring_context
    assert_equal 5, ctx["technicians_needed"]
    assert_equal "5-10", ctx["technicians_needed_raw"]
  end

  test "empty optional fields produce empty context" do
    payload = parse
    assert_equal({}, payload.hiring_context)
    assert_equal({}, payload.attribution)
    assert_nil payload.staffing_intent
    assert_equal [], payload.warnings
  end

  test "attribution keeps only known non-blank keys" do
    attr = parse("meta_lead_id" => "m1", "utm_source" => "facebook", "meta_ad_id" => "").attribution
    assert_equal({ "meta_lead_id" => "m1", "utm_source" => "facebook" }, attr)
  end

  test "event type is fixed" do
    assert_equal "company_onboarding", parse("event" => "profile_photo").event_type
  end
end
