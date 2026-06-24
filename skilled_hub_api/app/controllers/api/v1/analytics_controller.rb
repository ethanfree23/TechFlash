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

        released_scope = technician_payment_scope(technician_profile).where(payments: { status: 'released' })
        held_scope = technician_payment_scope(technician_profile).where(payments: { status: 'held' })
        earned_this_week_scope = released_scope.where('payments.released_at >= ?', 7.days.ago)

        # Total earned: prefer Stripe outside demo, but in demo always rely on seeded DB values.
        total_earned_cents =
          if demo_mode?
            released_scope.sum(:amount_cents)
          else
            PaymentService.stripe_earnings_cents_for(technician_profile)
          end
        total_earned_cents = released_scope.sum(:amount_cents) if total_earned_cents.nil?

        # In demo, guarantee non-zero financial analytics when jobs exist.
        if demo_mode? && total_earned_cents.to_i.zero? && completed_jobs.exists?
          total_earned_cents = completed_jobs.to_a.sum(&:tech_payout_cents)
        end

        pending_earned_cents = held_scope.sum(:amount_cents)
        if demo_mode? && pending_earned_cents.to_i.zero? && in_progress_jobs.exists?
          pending_earned_cents = in_progress_jobs.to_a.sum(&:tech_payout_cents)
        end

        earned_this_week_cents = earned_this_week_scope.sum(:amount_cents)
        if demo_mode? && earned_this_week_cents.to_i.zero?
          earned_this_week_cents = [total_earned_cents.to_i / 3, 0].max
        end

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
          total_jobs: completed_jobs.count + in_progress_jobs.count,
          released_earnings_by_day: DashboardTrends.released_payment_cents_per_day(released_scope)
        }
      end

      def technician_payment_scope(technician_profile)
        Payment.joins(:job)
          .joins('INNER JOIN job_applications ON job_applications.job_id = jobs.id')
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
      end

      def demo_mode?
        defined?(DemoMode) && DemoMode.enabled?
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
          total_jobs: 0,
          released_earnings_by_day: DashboardTrends.released_payment_cents_per_day(Payment.none)
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
          admins_count: User.admin.count,
          total_jobs: Job.count,
          jobs_open: Job.where(status: :open).count,
          jobs_finished: Job.where(status: :finished).count,
          jobs_in_progress: Job.where(status: [:reserved, :filled]).count,
          total_job_applications: JobApplication.count,
          trends_last_30d: DashboardTrends.admin_platform_trends
        }
      end
    end
  end
end
