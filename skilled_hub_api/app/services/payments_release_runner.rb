# frozen_string_literal: true

class PaymentsReleaseRunner
  def self.call
    released = 0
    skipped = []
    failed = []

    Job.where(status: :finished).where.not(finished_at: nil).find_each do |job|
      next unless job.payments.any?

      result = JobSettlementService.settle_and_release_if_eligible!(job)
      if result[:success] && result[:payment]
        released += 1
      elsif result[:error]
        failed << { job_id: job.id, error: result[:error] }
      else
        skipped << { job_id: job.id, reason: result[:reason] || result[:error] }
      end
    end

    { released: released, skipped: skipped, failed: failed }
  end
end
