# frozen_string_literal: true

module Api
  module V1
    class AnalyticsController < ApplicationController
      before_action :authenticate_user

      def show
        if @current_user.technician?
          render json: technician_analytics, status: :ok
        elsif @current_user.company?
          render json: company_analytics, status: :ok
        elsif @current_user.admin?
          render json: admin_analytics, status: :ok
        else
          render json: { error: 'Analytics not available for your role' }, status: :forbidden
        end
      end

      private

      def technician_analytics
        technician_profile = @current_user.technician_profile
        return default_technician_analytics unless technician_profile

        completed_jobs = Job.joins(:job_applications)
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
          .where(status: :finished)

        in_progress_jobs = Job.joins(:job_applications)
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
          .where(status: [:reserved, :filled])

        # Total earned: prefer Stripe (source of truth) over our DB
        total_earned_cents = PaymentService.stripe_earnings_cents_for(technician_profile)
        total_earned_cents = Payment.joins(:job)
          .joins('INNER JOIN job_applications ON job_applications.job_id = jobs.id')
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
          .where(payments: { status: 'released' })
          .sum(:amount_cents) if total_earned_cents.nil?

        # Pending earnings (held, not yet released)
        pending_earned_cents = Payment.joins(:job)
          .joins('INNER JOIN job_applications ON job_applications.job_id = jobs.id')
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
          .where(payments: { status: 'held' })
          .sum(:amount_cents)

        earned_this_week_cents = Payment.joins(:job)
          .joins('INNER JOIN job_applications ON job_applications.job_id = jobs.id')
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
          .where(payments: { status: 'released' })
          .where('payments.released_at >= ?', 7.days.ago)
          .sum(:amount_cents)

        average_rating = Rating.average_for(technician_profile)
        reviews_count = Rating.where(reviewee: technician_profile).count

        {
          total_earned_cents: total_earned_cents,
          pending_earned_cents: pending_earned_cents,
          earned_this_week_cents: earned_this_week_cents,
          jobs_completed: completed_jobs.count,
          jobs_in_progress: in_progress_jobs.count,
          average_rating: average_rating,
          reviews_count: reviews_count,
          total_jobs: completed_jobs.count + in_progress_jobs.count
        }
      end

      def default_technician_analytics
        {
          total_earned_cents: 0,
          pending_earned_cents: 0,
          earned_this_week_cents: 0,
          jobs_completed: 0,
          jobs_in_progress: 0,
          average_rating: nil,
          reviews_count: 0,
          total_jobs: 0
        }
      end

      def company_analytics
        company_profile = @current_user.company_profile
        CompanyMetrics.for_company_profile(company_profile)
      end

      def admin_analytics
        {
          total_users: User.count,
          technicians_count: User.technician.count,
          companies_count: User.company.count,
          total_jobs: Job.count,
          jobs_open: Job.where(status: :open).count,
          jobs_finished: Job.where(status: :finished).count,
          jobs_in_progress: Job.where(status: [:reserved, :filled]).count,
          total_job_applications: JobApplication.count
        }
      end
    end
  end
end
