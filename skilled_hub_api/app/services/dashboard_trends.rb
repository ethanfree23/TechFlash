# frozen_string_literal: true

# Builds fixed-length daily series for dashboard charts. Uses pluck + Ruby
# bucketing so SQLite (dev/test) and Postgres (production) stay compatible.
class DashboardTrends
  DAYS = 30

  class << self
    def date_spine(days: DAYS)
      zone = Time.zone
      today = zone.today
      ((days - 1).downto(0)).map { |i| today - i }
    end

    # @return [Array<Hash>] one row per day: { "date" => "YYYY-MM-DD", "count" => Integer }
    def counts_per_day_by_created_at(relation, days: DAYS)
      start = days.days.ago.beginning_of_day
      dates = date_spine(days: days)
      counts = Hash.new(0)
      relation.where("#{table_for(relation)}.created_at >= ?", start).pluck(:created_at).each do |ts|
        counts[ts.in_time_zone.to_date] += 1
      end
      dates.map { |d| { "date" => d.iso8601, "count" => counts[d] } }
    end

    # @return [Array<Hash>] { "date", "amount_cents" } summed per calendar day (released_at)
    def released_payment_cents_per_day(relation, days: DAYS)
      start = days.days.ago.beginning_of_day
      dates = date_spine(days: days)
      sums = Hash.new(0)
      relation
        .where.not(released_at: nil)
        .where("payments.released_at >= ?", start)
        .pluck(:released_at, :amount_cents)
        .each do |released_at, cents|
          sums[released_at.in_time_zone.to_date] += cents.to_i
        end
      dates.map { |d| { "date" => d.iso8601, "amount_cents" => sums[d] } }
    end

    def admin_platform_trends(days: DAYS)
      start = days.days.ago.beginning_of_day
      spine = date_spine(days: days)
      u = Hash.new(0)
      j = Hash.new(0)
      a = Hash.new(0)
      User.where("users.created_at >= ?", start).pluck(:created_at).each { |ts| u[ts.in_time_zone.to_date] += 1 }
      Job.where("jobs.created_at >= ?", start).pluck(:created_at).each { |ts| j[ts.in_time_zone.to_date] += 1 }
      JobApplication.where("job_applications.created_at >= ?", start).pluck(:created_at).each { |ts| a[ts.in_time_zone.to_date] += 1 }
      spine.map do |d|
        {
          "date" => d.iso8601,
          "users_created" => u[d],
          "jobs_created" => j[d],
          "applications_created" => a[d]
        }
      end
    end

    private

    def table_for(relation)
      relation.klass.table_name
    end
  end
end
