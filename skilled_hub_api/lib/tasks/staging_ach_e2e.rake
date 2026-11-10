# frozen_string_literal: true

namespace :staging do
  desc "Real Stripe TEST-mode ACH/card E2E against staging (refuses unless Rails.env.staging? + sk_test + Connect)"
  task ach_e2e: :environment do
    require_relative "../staging_ach_e2e_runner"
    StagingAchE2eRunner.new.run!
  end
end
