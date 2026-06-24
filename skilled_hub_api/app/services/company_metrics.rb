# frozen_string_literal: true

# Computes the same job/financial aggregates as the company dashboard analytics.
class CompanyMetrics
  def self.for_company_profile(company_profile)
    new(company_profile).to_h
  end

  def initialize(company_profile)
    @company_profile = company_profile
  end

  def to_h
    return default_hash unless @company_profile

    jobs = @company_profile.jobs

    completed_jobs = jobs.where(status: :finished)
    open_jobs = jobs.where(status: :open).where("scheduled_end_at IS NULL OR scheduled_end_at >= ?", Time.current)
    expired_open = jobs.where(status: :open).where("scheduled_end_at IS NOT NULL AND scheduled_end_at < ?", Time.current)
    active_jobs = jobs.where(status: %i[reserved filled])
      .where("scheduled_start_at IS NOT NULL AND scheduled_start_at <= ?", Time.current)
    claimed_jobs = jobs.where(status: %i[reserved filled])
      .where("scheduled_start_at IS NULL OR scheduled_start_at > ?", Time.current)

    total_spent_cents = completed_jobs.to_a.sum(&:company_charge_cents)

    unique_technicians = JobApplication
      .joins(:job)
      .where(jobs: { company_profile_id: @company_profile.id })
      .where(status: :accepted)
      .distinct
      .pluck(:technician_profile_id)
      .uniq
      .count

    jobs_created_by_day = DashboardTrends.counts_per_day_by_created_at(jobs)

    {
      total_spent_cents: total_spent_cents,
      jobs_posted: jobs.count,
      jobs_completed: completed_jobs.count,
      jobs_open: open_jobs.count,
      jobs_expired: expired_open.count,
      jobs_active: active_jobs.count,
      jobs_claimed: claimed_jobs.count,
      unique_technicians_hired: unique_technicians,
      total_jobs: jobs.count,
      jobs_created_by_day: jobs_created_by_day
    }
  end

  def default_hash
    {
      total_spent_cents: 0,
      jobs_posted: 0,
      jobs_completed: 0,
      jobs_open: 0,
      jobs_expired: 0,
      jobs_active: 0,
      jobs_claimed: 0,
      unique_technicians_hired: 0,
      total_jobs: 0,
      jobs_created_by_day: DashboardTrends.counts_per_day_by_created_at(Job.none)
    }
  end
end
