# frozen_string_literal: true

namespace :demo do
  desc "Seed the demo database with polished marketplace data (demo/development only)"
  task seed: :environment do
    DemoMode.assert_not_production!
    unless DemoMode.enabled? || Rails.env.development?
      raise DemoMode::SafetyError, "REFUSED: demo:seed requires RAILS_ENV=demo or DEMO_MODE=true"
    end
    stats = Demo::Seeder.seed!
    puts "Demo seed complete: #{stats.inspect}"
  end

  desc "Clear and reseed the demo database (requires ALLOW_DEMO_RESET=true, never production)"
  task reset: :environment do
    stats = Demo::Seeder.reset!
    puts "Demo reset complete: #{stats.inspect}"
  end

  desc "Re-date existing demo jobs onto the current calendar and add the curated CRM book. Does not create jobs or technicians, and refuses production."
  task refresh: :environment do
    Demo::EnvironmentGuard.assert_demo_database!
    windows = Demo::JobWindowRefresh.call
    crm = Demo::CrmSeed.call
    puts "Demo refresh complete. Job windows: #{windows.inspect}. CRM: #{crm.inspect}"
  end

  namespace :db do
    desc "Alias for demo:seed"
    task seed: :environment do
      Rake::Task["demo:seed"].invoke
    end
  end
end
