# frozen_string_literal: true

require "test_helper"

class Demo::CrmSeedTest < ActiveSupport::TestCase
  test "crm seed and job refresh refuse production" do
    Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
      ENV["DEMO_MODE"] = "true"
      assert_raises(DemoMode::SafetyError) { Demo::CrmSeed.call }
      assert_raises(DemoMode::SafetyError) { Demo::JobWindowRefresh.call }
    end
  ensure
    ENV.delete("DEMO_MODE")
  end

  test "crm catalog stays a short named book" do
    assert_operator Demo::CrmSeed::LEADS.size, :<=, 20
    assert_equal Demo::CrmSeed::LEADS.map { |lead| lead[:name] }.uniq.size, Demo::CrmSeed::LEADS.size
    assert_includes Demo::CrmSeed::LEADS.map { |lead| lead[:status] }, "customer"
    assert_includes Demo::CrmSeed::LEADS.map { |lead| lead[:name] }, "Bayou City Mechanical"
  end
end
