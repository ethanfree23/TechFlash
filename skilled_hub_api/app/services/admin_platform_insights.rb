# frozen_string_literal: true

# Aggregates per-entity metrics for the admin dashboard (time-window aware).
class AdminPlatformInsights
  CATEGORIES = %w[
    total_users technicians companies total_jobs job_applications
    open_jobs jobs_in_progress completed
  ].freeze

  def self.call(category:, period: "7d")
    new(category: category, period: period).to_h
  end

  def initialize(category:, period:)
    @category = category.to_s.strip
    @period = period.to_s.strip.presence || "7d"
    @since = parse_since(@period)
  end

  def to_h
    return { error: "Unknown category", valid_categories: CATEGORIES } unless CATEGORIES.include?(@category)

    send("build_#{@category}")
  end

  private

  def parse_since(period)
    case period
    when "today" then Time.zone.now.beginning_of_day
    when "24h", "1d" then 24.hours.ago
    when "7d", "7" then 7.days.ago
    when "30d", "30" then 30.days.ago
    when "90d", "90" then 90.days.ago
    when "ytd" then Time.zone.now.beginning_of_year
    when "all", "" then nil
    else 7.days.ago
    end
  end

  def time_scope(relation, column = "created_at")
    return relation if @since.nil?

    col = column.to_s.include?(".") ? column : "#{relation.table.name}.#{column}"
    relation.where("#{col} >= ?", @since)
  end

  def payment_time_scope(relation)
    return relation if @since.nil?

    relation.where("COALESCE(payments.released_at, payments.created_at) >= ?", @since)
  end

  def job_thread_messages
    Message.joins(:conversation).merge(Conversation.job_threads)
  end

  def messages_in_period
    rel = job_thread_messages
    time_scope(rel, "messages.created_at")
  end

  def login_events_in_period
    rel = UserLoginEvent.where(via_masquerade: false)
    time_scope(rel, "user_login_events.created_at")
  end

  def logins_for_user_ids(user_ids)
    return {} if user_ids.empty?

    login_events_in_period.where(user_id: user_ids).group(:user_id).count
  end

  def messages_sent_by_user(user)
    scope = messages_in_period
    total = scope.where(sender_type: "User", sender_id: user.id).count
    if user.technician? && (tp = user.technician_profile)
      total += scope.where(sender_type: "TechnicianProfile", sender_id: tp.id).count
    end
    if user.company? && (cp = user.company_profile)
      total += scope.where(sender_type: "CompanyProfile", sender_id: cp.id).count
    end
    total
  end

  def reviews_given_in_period_for_profile(profile)
    return 0 if profile.nil?

    rel = Rating.where(reviewer_type: profile.class.name, reviewer_id: profile.id)
    time_scope(rel, "ratings.created_at").count
  end

  def reviews_received_in_period_for_profile(profile)
    return 0 if profile.nil?

    rel = Rating.where(reviewee_type: profile.class.name, reviewee_id: profile.id)
    time_scope(rel, "ratings.created_at").count
  end

  def money_earned_cents_technician(tp)
    job_ids = Job.joins(:job_applications)
      .where(job_applications: { technician_profile_id: tp.id, status: :accepted })
      .distinct
      .pluck(:id)
    return 0 if job_ids.empty?

    rel = Payment.where(job_id: job_ids).merge(Payment.released)
    payment_time_scope(rel).sum(:amount_cents)
  end

  def money_spent_cents_company(cp)
    rel = Payment.joins(:job).where(jobs: { company_profile_id: cp.id }).merge(Payment.released)
    rel = payment_time_scope(rel)
    rel.sum(:amount_cents)
  end

  def ratings_count_in_period
    rel = Rating.all
    time_scope(rel, "ratings.created_at").count
  end

  def build_total_users
    users = User.includes(:technician_profile, :company_profile).order(:id)
    ids = users.map(&:id)
    logins = logins_for_user_ids(ids)

    items = users.map do |u|
      reviews_given = if u.technician? && u.technician_profile
                        reviews_given_in_period_for_profile(u.technician_profile)
                      elsif u.company? && u.company_profile
                        reviews_given_in_period_for_profile(u.company_profile)
                      else
                        0
                      end
      reviews_received = if u.technician? && u.technician_profile
                           reviews_received_in_period_for_profile(u.technician_profile)
                         elsif u.company? && u.company_profile
                           reviews_received_in_period_for_profile(u.company_profile)
                         else
                           0
                         end
      money_cents = if u.technician? && u.technician_profile
                      money_earned_cents_technician(u.technician_profile)
                    elsif u.company? && u.company_profile
                      money_spent_cents_company(u.company_profile)
                    else
                      0
                    end

      {
        id: u.id,
        email: u.email,
        role: u.role,
        logins: logins[u.id].to_i,
        messages_sent: messages_sent_by_user(u),
        money_cents: money_cents,
        reviews_given: reviews_given,
        reviews_received: reviews_received
      }
    end

    {
      category: @category,
      period: @period,
      since: @since&.iso8601,
      label: "All users",
      totals: {
        count: items.size,
        logins: items.sum { |i| i[:logins] },
        messages_sent: items.sum { |i| i[:messages_sent] },
        money_cents: items.sum { |i| i[:money_cents] },
        reviews: ratings_count_in_period
      },
      items: items
    }
  end

  def build_technicians
    profiles = TechnicianProfile.includes(:user).order(:id)
    user_ids = profiles.map { |p| p.user_id }
    logins = logins_for_user_ids(user_ids)

    items = profiles.map do |tp|
      u = tp.user
      {
        id: tp.id,
        user_id: u.id,
        email: u.email,
        trade_type: tp.trade_type,
        city: tp.city,
        state: tp.state,
        location: tp.location,
        background_verified: tp.background_verified,
        logins: logins[u.id].to_i,
        messages_sent: messages_sent_by_user(u),
        money_earned_cents: money_earned_cents_technician(tp),
        reviews_received: reviews_received_in_period_for_profile(tp),
        reviews_given: reviews_given_in_period_for_profile(tp)
      }
    end

    {
      category: @category,
      period: @period,
      since: @since&.iso8601,
      label: "Technicians",
      totals: {
        count: items.size,
        logins: items.sum { |i| i[:logins] },
        messages_sent: items.sum { |i| i[:messages_sent] },
        money_cents: items.sum { |i| i[:money_earned_cents] },
        reviews: items.sum { |i| i[:reviews_received] + i[:reviews_given] }
      },
      items: items
    }
  end

  def build_companies
    profiles = CompanyProfile.includes(:user).order(:id)
    user_ids = profiles.map { |p| p.user_id }
    logins = logins_for_user_ids(user_ids)

    items = profiles.map do |cp|
      u = cp.user
      {
        id: cp.id,
        user_id: u.id,
        email: u.email,
        company_name: cp.company_name,
        state: cp.state,
        location: cp.location,
        logins: logins[u.id].to_i,
        messages_sent: messages_sent_by_user(u),
        money_spent_cents: money_spent_cents_company(cp),
        reviews_received: reviews_received_in_period_for_profile(cp),
        reviews_given: reviews_given_in_period_for_profile(cp)
      }
    end

    {
      category: @category,
      period: @period,
      since: @since&.iso8601,
      label: "Companies",
      totals: {
        count: items.size,
        logins: items.sum { |i| i[:logins] },
        messages_sent: items.sum { |i| i[:messages_sent] },
        money_cents: items.sum { |i| i[:money_spent_cents] },
        reviews: items.sum { |i| i[:reviews_received] + i[:reviews_given] }
      },
      items: items
    }
  end

  def job_scope_for_category
    case @category
    when "total_jobs" then Job.all
    when "open_jobs" then Job.where(status: :open)
    when "jobs_in_progress" then Job.where(status: %i[reserved filled])
    when "completed" then Job.where(status: :finished)
    else Job.none
    end
  end

  def ja_counts_by_job(job_ids)
    return {} if job_ids.empty?

    ja = JobApplication.where(job_id: job_ids)
    ja = time_scope(ja, "job_applications.created_at") if @since
    ja.group(:job_id).count
  end

  def message_counts_by_job(job_ids)
    return {} if job_ids.empty?

    q = Message.joins(:conversation).merge(Conversation.job_threads)
      .where(conversations: { job_id: job_ids })
    q = time_scope(q, "messages.created_at") if @since
    q.group("conversations.job_id").count
  end

  def payment_sums_by_job(job_ids)
    return {} if job_ids.empty?

    pay = Payment.where(job_id: job_ids).merge(Payment.released)
    pay = payment_time_scope(pay) if @since
    pay.group(:job_id).sum(:amount_cents)
  end

  def rating_counts_by_job(job_ids)
    return {} if job_ids.empty?

    r = Rating.where(job_id: job_ids)
    r = time_scope(r, "ratings.created_at") if @since
    r.group(:job_id).count
  end

  def build_job_insight
    jobs = job_scope_for_category.includes(:company_profile).order(created_at: :desc)
    job_ids = jobs.map(&:id)

    app_counts = ja_counts_by_job(job_ids)
    msg_counts = message_counts_by_job(job_ids)
    pay_sums = payment_sums_by_job(job_ids)
    rating_counts = rating_counts_by_job(job_ids)

    items = jobs.map do |job|
      jid = job.id
      {
        id: jid,
        title: job.title,
        status: job.status,
        company_name: job.company_profile&.company_name,
        created_at: job.created_at&.iso8601,
        scheduled_end_at: job.scheduled_end_at&.iso8601,
        skill_class: job.skill_class,
        city: job.city,
        state: job.state,
        location: job.location,
        hourly_rate_cents: job.hourly_rate_cents,
        applications_in_period: app_counts[jid].to_i,
        messages_in_period: msg_counts[jid].to_i,
        money_released_cents: pay_sums[jid].to_i,
        ratings_in_period: rating_counts[jid].to_i
      }
    end

    label = {
      "total_jobs" => "All jobs",
      "open_jobs" => "Open jobs",
      "jobs_in_progress" => "In progress",
      "completed" => "Completed jobs"
    }[@category]

    {
      category: @category,
      period: @period,
      since: @since&.iso8601,
      label: label,
      totals: {
        count: items.size,
        logins: nil,
        messages_sent: items.sum { |i| i[:messages_in_period] },
        money_cents: items.sum { |i| i[:money_released_cents] },
        reviews: items.sum { |i| i[:ratings_in_period] },
        applications: items.sum { |i| i[:applications_in_period] }
      },
      items: items
    }
  end

  alias build_total_jobs build_job_insight
  alias build_open_jobs build_job_insight
  alias build_jobs_in_progress build_job_insight
  alias build_completed build_job_insight

  def build_job_applications
    apps = JobApplication.includes(technician_profile: :user, job: :company_profile)
    apps = time_scope(apps, "job_applications.created_at") if @since
    apps = apps.order(created_at: :desc)

    items = apps.map do |ja|
      job = ja.job
      tech = ja.technician_profile
      u = tech&.user
      {
        id: ja.id,
        status: ja.status,
        created_at: ja.created_at&.iso8601,
        job_id: job.id,
        job_title: job.title,
        technician_email: u&.email,
        company_name: job.company_profile&.company_name,
        skill_class: job.skill_class,
        city: job.city,
        state: job.state,
        location: job.location
      }
    end

    {
      category: @category,
      period: @period,
      since: @since&.iso8601,
      label: "Job applications",
      totals: {
        count: items.size,
        logins: nil,
        messages_sent: nil,
        money_cents: nil,
        reviews: nil,
        applications: items.size
      },
      items: items
    }
  end
end
