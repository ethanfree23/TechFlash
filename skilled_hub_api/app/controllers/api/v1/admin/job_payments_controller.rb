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
                JobPaymentTransaction.statuses[:processing],
                JobPaymentTransaction.statuses[:outcome_unknown]
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

        # POST /api/v1/admin/job_payments/:id/resolve_risk
        # Administrative resolution only — never reverses Stripe transfers automatically.
        def resolve_risk
          txn = JobPaymentTransaction.find(params[:id])
          note = params[:note].to_s.presence || "Admin resolved financial risk review."
          risks = PaymentRiskEvent.blocking.where(job_id: txn.job_id)
          risks.find_each { |r| r.resolve!(note: note, actor: current_user&.email) }
          txn.update!(investigation_required: false) if txn.investigation_required?
          render json: {
            ok: true,
            resolved_count: risks.size,
            job_payment: serialize(txn.reload, detailed: true),
            note: "Transfers are not automatically reversed. Bank payout status remains unknown unless proven."
          }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Not found" }, status: :not_found
        end

        # POST /api/v1/admin/payment_risk_events/:id/resolve
        def resolve_risk_event
          risk = PaymentRiskEvent.find(params[:id])
          risk.resolve!(
            note: params[:note].to_s.presence || "Admin resolved risk event.",
            actor: current_user&.email
          )
          render json: {
            ok: true,
            risk_event: {
              id: risk.id,
              risk_kind: risk.risk_kind,
              investigation_status: risk.investigation_status,
              lifecycle_state: risk.lifecycle_state,
              resolved_at: risk.resolved_at&.iso8601,
              resolved_by: risk.resolved_by
            }
          }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Not found" }, status: :not_found
        end

        # POST /api/v1/admin/job_payments/:id/reconcile_transfer
        # Looks up Stripe for an outcome_unknown/pending technician transfer; never invents certainty.
        # Optional authorize_retry=true: after a complete not-found outside the 24h window, stamp
        # admin authorization so a subsequent same-allocation create may proceed. Refuses when
        # lookup_failed or recovered transfer mismatches local ledger.
        def reconcile_transfer
          txn = JobPaymentTransaction.find(params[:id])
          authorize_retry = ActiveModel::Type::Boolean.new.cast(params[:authorize_retry])
          result = PaymentService.reconcile_technician_transfer!(
            txn,
            admin_authorize_retry: authorize_retry,
            actor: current_user,
            reason: params[:reason],
            acknowledged_prior_timeout_risk: params[:acknowledged_prior_timeout_risk]
          )
          if result[:success]
            render json: {
              ok: true,
              reconciled: true,
              job_payment: serialize(txn.reload, detailed: true),
              result: result.except(:payment, :transaction)
            }, status: :ok
          elsif result[:lookup_failed] || result[:mismatch]
            render json: {
              ok: false,
              error: result[:error],
              lookup_failed: result[:lookup_failed],
              mismatch: result[:mismatch],
              mismatches: result[:mismatches],
              allow_retry: false,
              job_payment: serialize(txn.reload, detailed: true)
            }, status: :unprocessable_entity
          elsif result[:requires_admin_authorization]
            render json: {
              ok: false,
              error: result[:error],
              requires_admin_authorization: true,
              allow_retry: false,
              job_payment: serialize(txn.reload, detailed: true)
            }, status: :unprocessable_entity
          elsif result[:found] == false
            render json: {
              ok: true,
              reconciled: false,
              found: false,
              allow_retry: result[:allow_retry],
              admin_authorized: result[:admin_authorized],
              message: result[:message],
              job_payment: serialize(txn.reload, detailed: true)
            }, status: :ok
          else
            render json: { ok: false, error: result[:error] || "Reconcile failed" }, status: :unprocessable_entity
          end
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Not found" }, status: :not_found
        end

        private

        def attention_counts
          {
            processing: JobPaymentTransaction.status_processing.count,
            failed: JobPaymentTransaction.status_failed.count,
            outcome_unknown: JobPaymentTransaction.status_outcome_unknown.count,
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
            review_required: txn.investigation_required || open_risk.present? || txn.disputed? || txn.status_processing? || txn.status_outcome_unknown?,
            outcome_unknown: txn.status_outcome_unknown?,
            payout_at_risk: open_risk.present? && %w[post_success_return post_success_dispute post_success_reversal_unconfirmed].include?(open_risk.risk_kind),
            collected_cents: ledger&.collected_cents,
            refunded_cents: ledger&.refunded_cents,
            transferred_cents: ledger&.transferred_cents,
            processing_at: txn.processing_at&.iso8601,
            transfer_first_attempted_at: txn.transfer_first_attempted_at&.iso8601,
            succeeded_at: txn.succeeded_at&.iso8601,
            created_at: txn.created_at&.iso8601,
            error_message: txn.error_message,
            transfer_mismatch: ActiveModel::Type::Boolean.new.cast(txn.metadata_json.to_h["transfer_mismatch"]),
            lookup_failed: ActiveModel::Type::Boolean.new.cast(txn.metadata_json.to_h["lookup_failed"]),
            needs_attention: txn.status_failed? || txn.status_processing? || txn.status_outcome_unknown? || txn.disputed? || txn.investigation_required || open_risk.present?,
            settlement_status: job&.settlement_status,
            funding_status: job&.funding_status,
            posted_under_funding_waiver: job&.posted_under_funding_waiver?,
            risk_events: risks.map { |r|
              {
                id: r.id,
                risk_kind: r.risk_kind,
                investigation_status: r.investigation_status,
                lifecycle_state: r.lifecycle_state,
                exposure_confirmed: r.exposure_confirmed,
                confirmed_loss_cents: r.confirmed_loss_cents,
                transfer_already_executed: r.transfer_already_executed,
                bank_payout_status: r.bank_payout_status,
                amount_cents: r.amount_cents,
                stripe_event_id: r.stripe_event_id,
                stripe_dispute_id: r.stripe_dispute_id,
                stripe_transfer_id: r.stripe_transfer_id,
                stripe_payout_id: r.stripe_payout_id,
                correlation_key: r.correlation_key,
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
