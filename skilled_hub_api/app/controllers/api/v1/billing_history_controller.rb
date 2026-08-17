# frozen_string_literal: true

module Api
  module V1
    class BillingHistoryController < ApplicationController
      before_action :authenticate_user

      def show
        unless @current_user.company? || @current_user.admin?
          return render json: { error: "Company or admin only" }, status: :forbidden
        end

        jobs = billing_jobs.includes(:job_payment_transactions, :payments, :company_profile)
        entries = jobs.flat_map { |job| serialize_job(job) }.sort_by { |row| row[:occurred_at] || "" }.reverse
        render json: { billing_history: entries }, status: :ok
      end

      private

      def billing_jobs
        if @current_user.admin? && params[:company_profile_id].present?
          Job.where(company_profile_id: params[:company_profile_id])
        elsif @current_user.admin? && params[:user_id].present?
          user = User.find_by(id: params[:user_id])
          Job.where(company_profile_id: user&.company_profile_id)
        else
          Job.where(company_profile_id: @current_user.company_profile&.id)
        end
      end

      def serialize_job(job)
        ledger = JobLedger.for(job)
        job.job_payment_transactions.order(:created_at).map do |txn|
          {
            id: txn.id,
            job_id: job.id,
            job_title: job.title,
            transaction_type: txn.transaction_type,
            amount_cents: txn.amount_cents,
            currency: txn.currency,
            direction: txn.direction,
            status: txn.status,
            net_funded_cents: ledger.net_funded_cents,
            company_required_cents: ledger.company_required_cents,
            occurred_at: (txn.succeeded_at || txn.created_at)&.iso8601,
            stripe_payment_intent_id: txn.stripe_payment_intent_id,
            stripe_refund_id: txn.stripe_refund_id,
            stripe_transfer_id: txn.stripe_transfer_id
          }
        end
      end
    end
  end
end
