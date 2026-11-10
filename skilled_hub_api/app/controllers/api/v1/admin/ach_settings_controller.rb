# frozen_string_literal: true

module Api
  module V1
    module Admin
      class AchSettingsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # GET /api/v1/admin/ach_settings
        def show
          render json: {
            global_ach_payments_enabled: AchAccess.global_enabled_without_env_kill,
            effective_global_ach_payments_enabled: AchAccess.global_enabled?,
            ach_global_disabled_env: AchAccess.env_kill_switch?,
            enabled_companies_count: CompanyProfile.where(ach_payments_enabled: true).count,
            recent_audits: recent_audits(limit: 25)
          }, status: :ok
        end

        # PATCH /api/v1/admin/ach_settings/global
        # Body: { enabled: true/false }
        def update_global
          unless params.key?(:enabled)
            return render json: { error: "enabled is required" }, status: :unprocessable_entity
          end

          AchAccess.set_global!(enabled: params[:enabled], actor: current_user, source: "admin")
          render json: {
            ok: true,
            global_ach_payments_enabled: AchAccess.global_enabled_without_env_kill,
            effective_global_ach_payments_enabled: AchAccess.global_enabled?,
            ach_global_disabled_env: AchAccess.env_kill_switch?,
            recent_audits: recent_audits(limit: 10)
          }, status: :ok
        end

        # PATCH /api/v1/admin/ach_settings/companies/:company_profile_id
        # Body: { enabled: true/false }
        def update_company
          company = CompanyProfile.find(params[:company_profile_id])
          unless params.key?(:enabled)
            return render json: { error: "enabled is required" }, status: :unprocessable_entity
          end

          AchAccess.set_company!(company, enabled: params[:enabled], actor: current_user, source: "admin")
          render json: {
            ok: true,
            company_profile_id: company.id,
            company_name: company.company_name,
            ach_payments_enabled: company.ach_payments_enabled,
            effective_ach_payments_enabled: AchAccess.allowed?(company),
            recent_audits: recent_audits(company_profile_id: company.id, limit: 10)
          }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Company not found" }, status: :not_found
        end

        # GET /api/v1/admin/ach_settings/audits
        def audits
          scope = AchFeatureAudit.order(created_at: :desc)
          scope = scope.where(company_profile_id: params[:company_profile_id]) if params[:company_profile_id].present?
          scope = scope.where(scope: params[:scope]) if params[:scope].present?
          limit = [[params[:limit].to_i, 1].max, 200].min
          limit = 50 if params[:limit].blank?
          rows = scope.limit(limit).map { |a| serialize_audit(a) }
          render json: { audits: rows }, status: :ok
        end

        # GET /api/v1/admin/ach_settings/monitoring
        # ACH operational dashboard: statuses, risks, outcome_unknown, pending funding age.
        def monitoring
          days = [[params[:pending_funding_days].to_i, 1].max, 90].min
          days = 3 if params[:pending_funding_days].blank?
          cutoff = days.days.ago

          ach_txns = JobPaymentTransaction.ach
          transfer_unknown = JobPaymentTransaction
            .where(transaction_type: :technician_transfer, status: :outcome_unknown)
          flagged_mismatch = transfer_unknown.count { |t|
            ActiveModel::Type::Boolean.new.cast(t.metadata_json.to_h["transfer_mismatch"])
          }

          render json: {
            pending_funding_days: days,
            ach_by_status: {
              processing: ach_txns.status_processing.count,
              succeeded: ach_txns.status_succeeded.count,
              failed: ach_txns.status_failed.count,
              pending: ach_txns.status_pending.count,
              requires_action: ach_txns.status_requires_action.count,
              returned: JobPaymentTransaction.ach.where.not(dispute_status: [nil, ""]).count
            },
            returned_or_disputed: JobPaymentTransaction.ach.where.not(dispute_status: [nil, ""]).count,
            open_risk_events: PaymentRiskEvent.open_cases.count,
            blocking_risk_events: PaymentRiskEvent.blocking.count,
            transfers_outcome_unknown: transfer_unknown.count,
            transfers_flagged_mismatch: flagged_mismatch,
            jobs_pending_funding_older_than_days: Job
              .where(status: :pending_funding)
              .where("updated_at < ?", cutoff)
              .count,
            global: {
              global_ach_payments_enabled: AchAccess.global_enabled_without_env_kill,
              effective_global_ach_payments_enabled: AchAccess.global_enabled?,
              ach_global_disabled_env: AchAccess.env_kill_switch?,
              enabled_companies_count: CompanyProfile.where(ach_payments_enabled: true).count
            }
          }, status: :ok
        end

        private

        def recent_audits(company_profile_id: nil, limit: 25)
          scope = AchFeatureAudit.order(created_at: :desc)
          scope = scope.where(company_profile_id: company_profile_id) if company_profile_id
          scope.limit(limit).map { |a| serialize_audit(a) }
        end

        def serialize_audit(audit)
          {
            id: audit.id,
            scope: audit.scope,
            company_profile_id: audit.company_profile_id,
            actor_user_id: audit.actor_user_id,
            actor_email: audit.actor_email,
            old_value: audit.old_value,
            new_value: audit.new_value,
            source: audit.source,
            metadata_json: audit.metadata_json,
            created_at: audit.created_at&.iso8601
          }
        end
      end
    end
  end
end
