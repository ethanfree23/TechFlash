# frozen_string_literal: true

module Api
  module V1
    module Admin
      class JobPaymentsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # GET /api/v1/admin/job_payments
        # Filters: status, payment_method_type, needs_attention, company_profile_id, job_id, q
        def index
          scope = JobPaymentTransaction
            .includes(job: { company_profile: :user })
            .order(created_at: :desc)

          if params[:status].present?
            scope = scope.where(status: params[:status])
          end
          if params[:payment_method_type].present?
            scope = scope.where(payment_method_type: params[:payment_method_type])
          end
          if ActiveModel::Type::Boolean.new.cast(params[:needs_attention])
            risk_job_ids = PaymentRiskEvent.blocking.distinct.pluck(:job_id)
            scope = scope.where(
              "job_payment_transactions.status IN (:bad_status)
               OR (job_payment_transactions.dispute_status IS NOT NULL AND job_payment_transactions.dispute_status != '')
               OR job_payment_transactions.investigation_required = TRUE
               OR job_payment_transactions.job_id IN (:risk_jobs)",
              bad_status: [
                JobPaymentTransaction.statuses[:failed],
                JobPaymentTransaction.statuses[:processing]
              ],
              risk_jobs: risk_job_ids.presence || [0]
            )
          end
          if params[:company_profile_id].present?
            scope = scope.joins(:job).where(jobs: { company_profile_id: params[:company_profile_id] })
          end
          if params[:job_id].present?
            scope = scope.where(job_id: params[:job_id])
          end
          if params[:q].present?
            q = "%#{params[:q].to_s.strip}%"
            scope = scope.joins(job: { company_profile: :user }).where(
              "jobs.title LIKE :q OR users.email LIKE :q OR job_payment_transactions.stripe_payment_intent_id LIKE :q OR company_profiles.company_name LIKE :q",
              q: q
            )
          end

          limit = [[params[:limit].to_i, 1].max, 200].min
          limit = 50 if params[:limit].blank?
          offset = [params[:offset].to_i, 0].max

          total = scope.count
          rows = scope.offset(offset).limit(limit).map { |txn| serialize(txn) }

          render json: {
            job_payments: rows,
            total: total,
            limit: limit,
            offset: offset,
            attention_counts: attention_counts
          }, status: :ok
        end

        def show
          txn = JobPaymentTransaction.includes(job: { company_profile: :user }).find(params[:id])
          render json: { job_payment: serialize(txn, detailed: true) }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Not found" }, status: :not_found
        end

        private

        def attention_counts
          {
            processing: JobPaymentTransaction.status_processing.count,
            failed: JobPaymentTransaction.status_failed.count,
            disputed: JobPaymentTransaction.where.not(dispute_status: [nil, ""]).count,
            ach_processing: JobPaymentTransaction.ach.status_processing.count,
            open_risks: PaymentRiskEvent.open_cases.count,
            investigation_required: JobPaymentTransaction.where(investigation_required: true).count
          }
        end

        def serialize(txn, detailed: false)
          job = txn.job
          company = job&.company_profile
          risks = PaymentRiskEvent.where(job_id: txn.job_id).order(detected_at: :desc).limit(5)
          open_risk = risks.detect { |r| %w[open reviewing].include?(r.investigation_status) }
          ledger =
            begin
              JobLedger.for(job)
            rescue StandardError
              nil
            end
          payload = {
            id: txn.id,
            job_id: txn.job_id,
            job_title: job&.title,
            company_profile_id: company&.id,
            company_name: company&.company_name || company&.user&.email,
            company_email: company&.user&.email,
            transaction_type: txn.transaction_type,
            direction: txn.direction,
            amount_cents: txn.amount_cents,
            currency: txn.currency,
            status: txn.status,
            payment_method_type: txn.payment_method_type,
            payment_method_display: txn.payment_method_display,
            payment_method_last4: txn.payment_method_last4,
            payment_method_brand: txn.payment_method_brand,
            payment_method_bank_name: txn.payment_method_bank_name,
            stripe_payment_intent_id: txn.stripe_payment_intent_id,
            stripe_charge_id: txn.stripe_charge_id,
            stripe_refund_id: txn.stripe_refund_id,
            stripe_transfer_id: txn.stripe_transfer_id,
            stripe_payment_method_id: txn.stripe_payment_method_id,
            source_charge_id: txn.source_charge_id,
            dispute_status: txn.dispute_status,
            stripe_dispute_id: txn.stripe_dispute_id,
            investigation_required: txn.investigation_required,
            bank_payout_status: txn.bank_payout_status.presence || "unknown",
            risk_kind: open_risk&.risk_kind,
            review_required: txn.investigation_required || open_risk.present? || txn.disputed? || txn.status_processing?,
            payout_at_risk: open_risk.present? && %w[post_success_return post_success_dispute post_success_reversal_unconfirmed].include?(open_risk.risk_kind),
            collected_cents: ledger&.collected_cents,
            refunded_cents: ledger&.refunded_cents,
            transferred_cents: ledger&.transferred_cents,
            processing_at: txn.processing_at&.iso8601,
            succeeded_at: txn.succeeded_at&.iso8601,
            created_at: txn.created_at&.iso8601,
            error_message: txn.error_message,
            needs_attention: txn.status_failed? || txn.status_processing? || txn.disputed? || txn.investigation_required || open_risk.present?,
            settlement_status: job&.settlement_status,
            funding_status: job&.funding_status,
            risk_events: risks.map { |r|
              {
                id: r.id,
                risk_kind: r.risk_kind,
                investigation_status: r.investigation_status,
                bank_payout_status: r.bank_payout_status,
                amount_cents: r.amount_cents,
                stripe_event_id: r.stripe_event_id,
                stripe_dispute_id: r.stripe_dispute_id,
                stripe_transfer_id: r.stripe_transfer_id,
                stripe_payout_id: r.stripe_payout_id,
                admin_note: r.admin_note,
                detected_at: r.detected_at&.iso8601,
                resolved_at: r.resolved_at&.iso8601
              }
            }
          }
          if detailed
            payload[:metadata_json] = txn.metadata_json
            payload[:idempotency_key] = txn.idempotency_key
            payload[:revision] = txn.revision
          end
          payload
        end
      end
    end
  end
end
