# frozen_string_literal: true

module Demo
  module EnvironmentGuard
    module_function

    def demo_database?
      return false if Rails.env.production?
      return true if Rails.env.demo?

      database = ActiveRecord::Base.connection_db_config.database.to_s
      DemoMode.enabled? && database.downcase.include?("demo")
    end

    def assert_demo_database!
      DemoMode.assert_not_production!
      return if demo_database?

      raise DemoMode::SafetyError,
            "REFUSED: Demo CRM and job-window refresh only run when RAILS_ENV=demo " \
            "(or DEMO_MODE=true against a database whose name includes 'demo')."
    end
  end
end
