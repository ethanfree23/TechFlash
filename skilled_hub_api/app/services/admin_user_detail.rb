# frozen_string_literal: true

# Per-user analytics for the admin Users UI (time window via +period+ like platform insights).
class AdminUserDetail
  def self.call(user_id:, period: "7d")
    new(user_id: user_id, period: period).to_h
  end

  def initialize(user_id:, period:)
    @user_id = user_id
    @period = period.to_s.strip.presence || "7d"
    @since = parse_since(@period)
  end

  def to_h
    user = User.includes(:technician_profile, :company_profile).find_by(id: @user_id)
    return { error: "User not found" } unless user
    return { error: "User is an admin account" } if user.admin?

    {
      user: user_payload(user),
      period: @period,
      since: @since&.iso8601,
      logins: login_stats(user),
      messages: message_stats(user),
      referrals: referral_stats(user),
      **role_analytics(user)
    }
  end

  private

  def parse_since(period)
    case period
    when "24h", "1d" then 24.hours.ago
    when "7d", "7" then 7.days.ago
    when "30d", "30" then 30.days.ago
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

  def user_payload(user)
    {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at&.iso8601,
      profile: profile_payload(user)
    }
  end

  def profile_payload(user)
    if user.technician?
      tp = user.technician_profile
      return nil unless tp

      {
        type: "technician",
        id: tp.id,
        trade_type: tp.trade_type,
        location: tp.location,
        experience_years: tp.experience_years,
        availability: tp.availability,
        bio: tp.bio,
        stripe_account_id: tp.stripe_account_id
      }
    elsif user.company?
      cp = user.company_profile
      return nil unless cp

      {
        type: "company",
        id: cp.id,
        company_name: cp.company_name,
        industry: cp.industry,
        location: cp.location,
        bio: cp.bio,
        phone: cp.phone,
        website_url: cp.website_url,
        facebook_url: cp.facebook_url,
        instagram_url: cp.instagram_url,
        linkedin_url: cp.linkedin_url,
        service_cities: Array(cp.service_cities),
        stripe_customer_id: user.stripe_customer_id
      }
    end
  end

  def login_stats(user)
    events = user.user_login_events.order(created_at: :desc)
    in_period = @since ? events.where("user_login_events.created_at >= ?", @since) : events
    {
      total_all_time: events.count,
      total_in_period: in_period.count,
      last_login_at: events.first&.created_at&.iso8601,
      recent: events.limit(20).map { |e| { at: e.created_at&.iso8601 } }
    }
  end

  def job_thread_messages_scope
    Message.joins(:conversation).merge(Conversation.job_threads)
  end

  def messages_sent_job_threads(user, scoped_to_period:)
    scope = job_thread_messages_scope
    scope = time_scope(scope, "messages.created_at") if scoped_to_period && @since
    count_sender_matches(scope, user)
  end

  def count_sender_matches(scope, user)
    total = scope.where(sender_type: "User", sender_id: user.id).count
    if user.technician? && (tp = user.technician_profile)
      total += scope.where(sender_type: "TechnicianProfile", sender_id: tp.id).count
    end
    if user.company? && (cp = user.company_profile)
      total += scope.where(sender_type: "CompanyProfile", sender_id: cp.id).count
    end
    total
  end

  def feedback_messages_sent(user, scoped_to_period:)
    scope = Message.joins(:conversation).merge(Conversation.feedback_threads).where(sender_type: "User", sender_id: user.id)
    scope = time_scope(scope, "messages.created_at") if scoped_to_period && @since
    scope.count
  end

  def message_stats(user)
    {
      job_threads_sent_all_time: messages_sent_job_threads(user, scoped_to_period: false),
      job_threads_sent_in_period: messages_sent_job_threads(user, scoped_to_period: true),
      feedback_messages_sent_all_time: feedback_messages_sent(user, scoped_to_period: false),
      feedback_messages_sent_in_period: feedback_messages_sent(user, scoped_to_period: true)
    }
  end

  def referral_stats(user)
    sent = user.sent_referrals.order(created_at: :desc)
    in_period = @since ? sent.where("referral_submissions.created_at >= ?", @since) : sent

    {
      sent_total: sent.count,
      sent_in_period: in_period.count,
      reward_eligible_total: sent.where.not(reward_eligible_at: nil).count,
      reward_issued_total: sent.where.not(reward_issued_at: nil).count,
      recent: sent.limit(20).map do |r|
        {
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          referred_type: r.referred_type,
          created_at: r.created_at&.iso8601,
          reward_eligible_at: r.reward_eligible_at&.iso8601,
          reward_issued_at: r.reward_issued_at&.iso8601
        }
      end
    }
  end

  def role_analytics(user)
    if user.company?
      company_analytics(user)
    else
      technician_analytics(user)
    end
  end

  def company_analytics(user)
    cp = user.company_profile
    return { role_key: :company, jobs: {}, payments: {}, ratings: {} } unless cp

    jobs = Job.where(company_profile_id: cp.id)
    jobs_period = @since ? jobs.where("jobs.created_at >= ?", @since) : jobs

    pay_scope = Payment.joins(:job).where(jobs: { company_profile_id: cp.id }).merge(Payment.released)
    pay_all = pay_scope.sum(:amount_cents)
    pay_period = payment_time_scope(pay_scope).sum(:amount_cents)

    recent_payments = Payment.joins(:job)
      .where(jobs: { company_profile_id: cp.id })
      .includes(:job)
      .order(Arel.sql("COALESCE(payments.released_at, payments.created_at) DESC"))
      .limit(15)

    received = Rating.where(reviewee_type: "CompanyProfile", reviewee_id: cp.id)
    given = Rating.where(reviewer_type: "CompanyProfile", reviewer_id: cp.id)

    {
      role_key: :company,
      jobs: {
        total: jobs.count,
        in_period: jobs_period.count,
        by_status: group_job_status_counts(jobs),
        recent: jobs.order(created_at: :desc).limit(10).map { |j| job_summary(j) }
      },
      payments: {
        spent_released_cents_all_time: pay_all,
        spent_released_cents_in_period: pay_period,
        recent: recent_payments.map { |p| payment_summary(p) }
      },
      ratings: ratings_payload(given, received)
    }
  end

  def technician_analytics(user)
    tp = user.technician_profile
    return { role_key: :technician, jobs: {}, applications: {}, payments: {}, ratings: {} } unless tp

    apps = JobApplication.where(technician_profile_id: tp.id)
    apps_period = @since ? apps.where("job_applications.created_at >= ?", @since) : apps

    job_ids = Job.joins(:job_applications)
      .where(job_applications: { technician_profile_id: tp.id, status: :accepted })
      .distinct
      .pluck(:id)

    earn_scope =
      if job_ids.empty?
        Payment.none
      else
        Payment.where(job_id: job_ids).merge(Payment.released)
      end
    earn_all = earn_scope.sum(:amount_cents)
    earn_period = payment_time_scope(earn_scope).sum(:amount_cents)

    recent_payments =
      if job_ids.empty?
        []
      else
        Payment.where(job_id: job_ids)
          .includes(:job)
          .merge(Payment.released)
          .order(Arel.sql("COALESCE(payments.released_at, payments.created_at) DESC"))
          .limit(15)
          .to_a
      end

    accepted_jobs = Job.joins(:job_applications)
      .where(job_applications: { technician_profile_id: tp.id, status: :accepted })

    received = Rating.where(reviewee_type: "TechnicianProfile", reviewee_id: tp.id)
    given = Rating.where(reviewer_type: "TechnicianProfile", reviewer_id: tp.id)

    {
      role_key: :technician,
      jobs: {
        accepted_total: accepted_jobs.count,
        accepted_in_period: @since ? accepted_jobs.where("jobs.created_at >= ?", @since).count : accepted_jobs.count,
        recent: accepted_jobs.order("jobs.created_at DESC").limit(10).map { |j| job_summary(j) }
      },
      applications: {
        total: apps.count,
        in_period: apps_period.count,
        by_status: group_application_status_counts(apps)
      },
      payments: {
        earned_released_cents_all_time: earn_all,
        earned_released_cents_in_period: earn_period,
        recent: Array(recent_payments).map { |p| payment_summary(p) }
      },
      ratings: ratings_payload(given, received)
    }
  end

  def job_summary(job)
    {
      id: job.id,
      title: job.title,
      status: job.status,
      created_at: job.created_at&.iso8601
    }
  end

  def payment_summary(payment)
    {
      id: payment.id,
      job_id: payment.job_id,
      job_title: payment.job&.title,
      amount_cents: payment.amount_cents,
      status: payment.status,
      released_at: payment.released_at&.iso8601,
      created_at: payment.created_at&.iso8601
    }
  end

  def ratings_payload(given_scope, received_scope)
    given_all = given_scope
    recv_all = received_scope
    given_p = @since ? time_scope(given_scope, "ratings.created_at") : given_scope
    recv_p = @since ? time_scope(received_scope, "ratings.created_at") : received_scope

    {
      given_total: given_all.count,
      given_in_period: given_p.count,
      received_total: recv_all.count,
      received_in_period: recv_p.count,
      avg_score_received: avg_score(recv_all),
      recent_received: recent_ratings_list(recv_all.order(created_at: :desc).limit(10)),
      recent_given: recent_ratings_list(given_all.order(created_at: :desc).limit(10))
    }
  end

  def avg_score(scope)
    return nil if scope.empty?

    (scope.average(:score)&.to_f&.round(2))
  end

  def group_application_status_counts(apps)
    counts = apps.group(:status).count
    counts.each_with_object({}) do |(k, v), h|
      key =
        case k
        when Integer then JobApplication.statuses.key(k)&.to_s || k.to_s
        else k.to_s
        end
      h[key] = v
    end
  end

  def group_job_status_counts(jobs)
    counts = jobs.group(:status).count
    counts.each_with_object({}) do |(k, v), h|
      key =
        case k
        when Integer then Job.statuses.key(k)&.to_s || k.to_s
        else k.to_s
        end
      h[key] = v
    end
  end

  def recent_ratings_list(scope)
    scope.includes(:job).map do |r|
      {
        id: r.id,
        job_id: r.job_id,
        job_title: r.job&.title,
        score: r.score&.to_f,
        comment: r.comment.to_s.truncate(200, omission: '…'),
        created_at: r.created_at&.iso8601,
        reviewer_type: r.reviewer_type,
        reviewee_type: r.reviewee_type
      }
    end
  end
end
