# frozen_string_literal: true

namespace :technician_onboarding do
  desc "Dry-run grandfathering report for guided technician onboarding (no writes)"
  task dry_run: :environment do
    result = TechnicianOnboardingGrandfathering.dry_run(limit_samples: 25)
    puts "Total technicians: #{result.total_technicians}"
    puts "Would grandfather: #{result.would_grandfather}"
    puts "Would require onboarding: #{result.would_require}"
    puts "Ambiguous (counted as require): #{result.ambiguous}"
    puts "Sample grandfather reasons: #{result.samples[:grandfather].map { |r| r[:reason] }.tally}"
    puts "Sample require reasons: #{result.samples[:require].map { |r| r[:reason] }.tally}"
  end

  desc "Apply grandfathering for established technicians (pass CONFIRM=1)"
  task apply_grandfathering: :environment do
    if ENV["CONFIRM"] != "1"
      puts "Refusing to write. Re-run with CONFIRM=1 after reviewing dry_run."
      exit 1
    end

    result = TechnicianOnboardingGrandfathering.apply_grandfathering!(dry_run: false)
    puts "Applied. Grandfathered candidates: #{result.would_grandfather}; required: #{result.would_require}"
  end

  desc "Send deduplicated assessment reminders for completed onboarding"
  task assessment_reminders: :environment do
    result = TechnicianOnboardingAssessmentReminders.call
    puts "Assessment reminders sent: #{result[:sent]}"
  end

  desc "Enable or disable the guided onboarding feature flag (ENABLED=true|false)"
  task set_flag: :environment do
    enabled = ActiveModel::Type::Boolean.new.cast(ENV.fetch("ENABLED", "false"))
    updated = TechnicianGuidedOnboarding.update_settings!(enabled: enabled)
    puts "technician_guided_onboarding => #{updated.inspect}"
  end
end
