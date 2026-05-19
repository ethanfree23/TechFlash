# frozen_string_literal: true

# Demo environment detection and safety checks for destructive demo tasks.
module DemoMode
  class SafetyError < StandardError; end

  module_function

  def enabled?
    return false if Rails.env.production?

    Rails.env.demo? || ENV["DEMO_MODE"].to_s.strip.casecmp("true").zero?
  end

  def reset_allowed?
    return false if Rails.env.production?

    allow = ENV["ALLOW_DEMO_RESET"].to_s.strip.casecmp("true").zero?
    return false unless allow

    enabled? || Rails.env.development?
  end

  def assert_not_production!
    return unless Rails.env.production?

    raise SafetyError,
          "REFUSED: Demo seed/reset cannot run in production (RAILS_ENV=production). " \
          "Use the isolated demo Railway service with RAILS_ENV=demo."
  end

  def assert_reset_allowed!
    assert_not_production!

    unless ENV["ALLOW_DEMO_RESET"].to_s.strip.casecmp("true").zero?
      raise SafetyError,
            "REFUSED: Set ALLOW_DEMO_RESET=true on this host before running demo:reset."
    end

    unless enabled? || Rails.env.development?
      raise SafetyError,
            "REFUSED: Demo reset only allowed when RAILS_ENV=demo (or development for local testing)."
    end

    assert_demo_database!
  end

  def assert_demo_database!
    if ENV["DATABASE_URL"].blank? && (Rails.env.demo? || (Rails.env.development? && enabled?))
      return assert_local_demo_sqlite!
    end

    unless enabled?
      raise SafetyError, "REFUSED: DEMO_MODE must be true (or RAILS_ENV=demo) before clearing data."
    end

    url = ENV["DATABASE_URL"].to_s
    if url.blank?
      raise SafetyError,
            "REFUSED: DATABASE_URL is blank. Demo deploy must use a dedicated demo Postgres database."
    end

    if production_database_url?(url)
      raise SafetyError,
            "REFUSED: DATABASE_URL looks like production. Use a separate demo Postgres on Railway."
    end

    expected = ENV["DEMO_DATABASE_NAME"].to_s.strip
    if expected.present?
      unless database_url_matches_name?(url, expected)
        raise SafetyError,
              "REFUSED: DATABASE_URL does not match DEMO_DATABASE_NAME=#{expected.inspect}."
      end
      return
    end

    unless demo_database_url?(url)
      raise SafetyError,
            "REFUSED: DATABASE_URL must include 'demo' in the host or database name, " \
            "or set DEMO_DATABASE_NAME to your demo DB name."
    end
  end

  def production_database_url?(url)
    down = url.downcase
    return true if down.include?("production")
    return true if down.include?("skilledhub-production")
    return true if ENV["RAILWAY_ENVIRONMENT_NAME"].to_s.downcase == "production"
    return true if ENV["RAILWAY_SERVICE_NAME"].to_s.downcase.include?("production")

    false
  end

  def demo_database_url?(url)
    down = url.downcase
    down.include?("demo") || down.include?("techflash-demo")
  end

  def database_url_matches_name?(url, name)
    down = url.downcase
    n = name.downcase
    down.include?("/#{n}") || down.include?("database=#{n}")
  end

  def assert_local_demo_sqlite!
    path = ActiveRecord::Base.connection_db_config.database.to_s
    return if path.include?("demo.sqlite3")

    raise SafetyError,
          "REFUSED: Local demo reset expects db/demo.sqlite3. Run with RAILS_ENV=demo."
  end
end
