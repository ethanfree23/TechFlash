# frozen_string_literal: true

require "test_helper"

class Demo::ResetGuardTest < ActiveSupport::TestCase
  test "enabled? is false in production even with DEMO_MODE" do
    Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
      ENV["DEMO_MODE"] = "true"
      refute DemoMode.enabled?
    end
  ensure
    ENV.delete("DEMO_MODE")
  end

  test "verify! raises in production" do
    Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
      ENV["ALLOW_DEMO_RESET"] = "true"
      ENV["DEMO_MODE"] = "true"
      error = assert_raises(DemoMode::SafetyError) { Demo::ResetGuard.verify! }
      assert_match(/production/i, error.message)
    end
  ensure
    ENV.delete("ALLOW_DEMO_RESET")
    ENV.delete("DEMO_MODE")
  end

  test "verify! raises without ALLOW_DEMO_RESET" do
    Rails.stub(:env, ActiveSupport::StringInquirer.new("demo")) do
      ENV.delete("ALLOW_DEMO_RESET")
      ENV["DEMO_MODE"] = "true"
      error = assert_raises(DemoMode::SafetyError) { Demo::ResetGuard.verify! }
      assert_match(/ALLOW_DEMO_RESET/i, error.message)
    end
  ensure
    ENV.delete("DEMO_MODE")
  end
end
