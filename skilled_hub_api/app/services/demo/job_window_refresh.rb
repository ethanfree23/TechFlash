# frozen_string_literal: true

module Demo
  # Moves existing demo jobs back onto the current calendar.
  # Does not create jobs, technicians, or companies.
  class JobWindowRefresh
    def self.call
      EnvironmentGuard.assert_demo_database!
      new.call
    end

    def call
      now = Time.current
      counts = Hash.new(0)

      Job.find_each do |job|
        label = apply_window!(job, now)
        counts[label] += 1
      end

      anchor_showcase_accounts!(now)
      counts
    end

    private

    def apply_window!(job, now)
      notes = job.notes.to_s
      if notes.include?("CHECKR_DEMO_JOB")
        job.update_columns(
          scheduled_start_at: now + 1.day,
          scheduled_end_at: now + 3.days,
          go_live_at: now - 1.day,
          status: Job.statuses[:filled]
        )
        return :checkr
      end

      if notes.include?("FLAGSHIP_DEMO_JOB")
        job.update_columns(
          scheduled_start_at: now + 1.day,
          scheduled_end_at: now + 3.days,
          go_live_at: now - 2.days,
          status: Job.statuses[:filled]
        )
        return :flagship
      end

      case job.status
      when "open", "pending_funding"
        expired_sample = (job.id % 21).zero?
        if expired_sample
          job.update_columns(
            scheduled_start_at: now - 4.days,
            scheduled_end_at: now - 2.days,
            go_live_at: now - 6.days
          )
          :expired_open
        else
          job.update_columns(
            scheduled_start_at: now + 2.days,
            scheduled_end_at: now + 5.days,
            go_live_at: now - 3.days
          )
          :open
        end
      when "filled", "reserved", "accepted"
        if job.id.even?
          job.update_columns(
            scheduled_start_at: now - 1.day,
            scheduled_end_at: now + 2.days,
            go_live_at: now - 4.days
          )
          :active
        else
          job.update_columns(
            scheduled_start_at: now + 3.days,
            scheduled_end_at: now + 6.days,
            go_live_at: now - 2.days
          )
          :upcoming
        end
      when "finished", "completed"
        job.update_columns(
          scheduled_start_at: now - 6.days,
          scheduled_end_at: now - 2.days,
          finished_at: now - 2.days,
          go_live_at: now - 10.days
        )
        :completed
      else
        :unchanged
      end
    end

    # The accounts used in the walkthrough should always show work happening now,
    # not only whichever rows happened to land on an even id.
    def anchor_showcase_accounts!(now)
      company = CompanyProfile.joins(:user).find_by(users: { email: MarketData::DEMO_EMAILS[:company] })
      technician = TechnicianProfile.joins(:user).find_by(users: { email: MarketData::DEMO_EMAILS[:technician] })

      anchor_company!(company, now) if company
      anchor_technician!(technician, now) if technician
    end

    def anchor_company!(company, now)
      open_jobs = company.jobs.where(status: :open).order(:id).to_a
      open_jobs.each_with_index do |job, index|
        if index.zero?
          job.update_columns(scheduled_start_at: now - 4.days, scheduled_end_at: now - 2.days, go_live_at: now - 6.days)
        else
          job.update_columns(scheduled_start_at: now + 1.day + index.hours, scheduled_end_at: now + 4.days, go_live_at: now - 3.days)
        end
      end

      claimed = company.jobs.where(status: %i[filled reserved accepted]).order(:id).to_a
      split_claimed!(claimed, now)
    end

    def anchor_technician!(technician, now)
      job_ids = Job.joins(:job_applications)
        .where(job_applications: { technician_profile_id: technician.id, status: :accepted })
        .distinct
        .pluck(:id)
      claimed = Job.where(id: job_ids, status: %i[filled reserved accepted]).order(:id).to_a
      split_claimed!(claimed, now)

      Job.where(id: job_ids, status: %i[finished completed]).find_each do |job|
        job.update_columns(
          scheduled_start_at: now - 6.days,
          scheduled_end_at: now - 2.days,
          finished_at: now - 2.days
        )
      end
    end

    def split_claimed!(jobs, now)
      return if jobs.empty?

      active_count = [jobs.size / 2, 1].max
      active_count = jobs.size - 1 if jobs.size > 1 && active_count >= jobs.size

      jobs.each_with_index do |job, index|
        if index < active_count
          job.update_columns(
            scheduled_start_at: now - 1.day,
            scheduled_end_at: now + 2.days,
            go_live_at: now - 4.days
          )
        else
          job.update_columns(
            scheduled_start_at: now + 2.days + index.hours,
            scheduled_end_at: now + 5.days,
            go_live_at: now - 2.days
          )
        end
      end
    end
  end
end
