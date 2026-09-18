# frozen_string_literal: true

module Jobs
  # Explicit lifecycle transition for in-progress jobs whose scheduled end has passed.
  class AutoCompleteExpiredService
    def self.call(now: Time.current, limit: nil)
      new(now: now, limit: limit).call
    end

    def initialize(now: Time.current, limit: nil)
      @now = now
      @limit = limit
    end

    def call
      completed = []
      skipped = []
      failed = []

      job_ids.each do |job_id|
        outcome = complete_one(job_id)
        case outcome[:state]
        when :completed then completed << { job_id: job_id, settlement: outcome[:settlement] }
        when :skipped then skipped << { job_id: job_id, reason: outcome[:reason] }
        else failed << { job_id: job_id, error: outcome[:error] }
        end
      end

      { completed: completed.size, completed_job_ids: completed.map { |c| c[:job_id] }, skipped: skipped, failed: failed }
    end

    private

    def job_ids
      scope = Job.due_for_auto_completion(now: @now).order(:id)
      scope = scope.limit(@limit) if @limit
      scope.pluck(:id)
    end

    def complete_one(job_id)
      outcome = nil
      job = nil

      Job.transaction do
        locked = Job.lock.find(job_id)

        if locked.terminated_early?
          outcome = { state: :skipped, reason: "Assignment was ended early" }
        elsif !(locked.reserved? || locked.filled?)
          outcome = { state: :skipped, reason: "No longer in progress (#{locked.status})" }
        elsif locked.scheduled_end_at.blank? || locked.scheduled_end_at > @now
          outcome = { state: :skipped, reason: "Scheduled end is not in the past" }
        else
          locked.update!(status: :finished, finished_at: Time.current)
          job = locked
        end
      end

      return outcome if outcome

      finalize(job)
    rescue StandardError => e
      Rails.logger.error("[auto_complete_expired] job_id=#{job_id} #{e.class}: #{e.message}")
      { state: :failed, error: "#{e.class}: #{e.message}" }
    end

    def finalize(job)
      settlement = JobSettlementService.settle_and_release_if_eligible!(job)
      ReferralRewardMarker.mark_for_finished_job!(job)
      MailDelivery.safe_deliver do
        UserMailer.job_completed_for_company(job).deliver_now
        UserMailer.job_completed_for_technician(job).deliver_now
      end
      { state: :completed, settlement: settlement }
    end
  end
end
