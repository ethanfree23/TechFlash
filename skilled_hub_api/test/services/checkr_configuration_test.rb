require "test_helper"

class CheckrConfigurationTest < ActiveSupport::TestCase
  test "prefers new secret key env var" do
    with_env(
      "CHECKR_SECRET_KEY" => "sk_staging_new",
      "CHECKR_STAGING_API_KEY" => "sk_legacy_staging",
      "CHECKR_API_KEY" => "sk_legacy_api",
      "CHECKR_ENVIRONMENT" => "staging"
    ) do
      config = CheckrConfiguration.new
      assert_equal "sk_staging_new", config.api_key
    end
  end

  test "uses staging key in staging environment when new key missing" do
    with_env(
      "CHECKR_SECRET_KEY" => nil,
      "CHECKR_STAGING_API_KEY" => "sk_staging_legacy",
      "CHECKR_API_KEY" => "sk_api_legacy",
      "CHECKR_ENVIRONMENT" => "staging"
    ) do
      config = CheckrConfiguration.new
      assert_equal "sk_staging_legacy", config.api_key
    end
  end

  test "blocks requests for production environment until explicitly enabled" do
    with_env(
      "CHECKR_ENVIRONMENT" => "production",
      "CHECKR_ENABLED" => "true",
      "CHECKR_BACKGROUND_CHECKS_ENABLED" => "true",
      "CHECKR_PRODUCTION_ENABLED" => "false"
    ) do
      config = CheckrConfiguration.new
      assert_equal false, config.requests_allowed?
      assert_match(/production mode is disabled/i, config.requests_block_reason)
    end
  end

  test "allows requests for production environment when enabled" do
    with_env(
      "CHECKR_ENVIRONMENT" => "production",
      "CHECKR_ENABLED" => "true",
      "CHECKR_BACKGROUND_CHECKS_ENABLED" => "true",
      "CHECKR_PRODUCTION_ENABLED" => "true"
    ) do
      config = CheckrConfiguration.new
      assert_equal true, config.requests_allowed?
    end
  end

  test "normalizes api base url" do
    with_env("CHECKR_API_BASE_URL" => "https://api.checkr.com/") do
      config = CheckrConfiguration.new
      assert_equal "https://api.checkr.com", config.api_base_url
    end
  end

  private

  def with_env(overrides)
    previous = overrides.keys.to_h { |key| [key, ENV[key]] }
    overrides.each do |key, value|
      if value.nil?
        ENV.delete(key)
      else
        ENV[key] = value
      end
    end
    yield
  ensure
    previous.each do |key, value|
      if value.nil?
        ENV.delete(key)
      else
        ENV[key] = value
      end
    end
  end
end
