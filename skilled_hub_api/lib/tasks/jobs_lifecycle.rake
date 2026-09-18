# frozen_string_literal: true

namespace :jobs do
  desc "Finish in-progress jobs whose scheduled end has passed, then settle them. Idempotent. LIMIT=n to drain gradually."
  task auto_complete_expired: :environment do
    result = Jobs::AutoCompleteExpiredService.call(limit: ENV["LIMIT"].presence&.to_i)
    puts "Auto-completed #{result[:completed]} job(s): #{result[:completed_job_ids].join(', ')}"
    result[:failed].each { |row| puts "Job #{row[:job_id]}: FAILED #{row[:error]}" }
    result[:skipped].each { |row| puts "Job #{row[:job_id]}: skipped #{row[:reason]}" if ENV["VERBOSE"] }
  end
end
