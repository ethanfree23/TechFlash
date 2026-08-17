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
    counts = Jobs::StatusCounts.for(jobs)

    completed_jobs = jobs.merge(Job.effectively_completed)

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
      jobs_posted: counts[:total],
      jobs_completed: counts[:completed],
      jobs_open: counts[:open],
      jobs_expired: counts[:expired],
      jobs_active: counts[:active],
      jobs_claimed: counts[:claimed_unstarted],
      jobs_counter_pending: counts[:counter_pending],
      unique_technicians_hired: unique_technicians,
      total_jobs: counts[:total],
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
      jobs_counter_pending: 0,
      unique_technicians_hired: 0,
      total_jobs: 0,
      jobs_created_by_day: DashboardTrends.counts_per_day_by_created_at(Job.none)
    }
  end
end
