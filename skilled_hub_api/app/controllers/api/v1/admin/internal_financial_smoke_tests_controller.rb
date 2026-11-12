# frozen_string_literal: true

module Api
  module V1
    module Admin
      class InternalFinancialSmokeTestsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_smoke_test, only: %i[show execute refund]

        # GET /api/v1/admin/internal_financial_smoke_tests
        def index
          scope = InternalFinancialSmokeTest.includes(:company_profile, :authorized_by_user).order(id: :desc)
          scope = scope.where(company_profile_id: params[:company_profile_id]) if params[:company_profile_id].present?
          limit = [[params[:limit].to_i, 1].max, 100].min
          limit = 25 if params[:limit].blank?
          render json: { smoke_tests: scope.limit(limit).map { |r| serialize(r) } }, status: :ok
        end

        # GET /api/v1/admin/internal_financial_smoke_tests/:id
        def show
          render json: { smoke_test: serialize(@smoke_test) }, status: :ok
        end

        # POST /api/v1/admin/internal_financial_smoke_tests
        # Body: { company_profile_id, amount_cents, authorization_reason }
        def create
          company = CompanyProfile.find(params[:company_profile_id])
          unless params[:authorization_reason].to_s.strip.present?
            return render json: { error: "authorization_reason is required" }, status: :unprocessable_entity
          end
          unless params.key?(:amount_cents)
            return render json: { error: "amount_cents is required" }, status: :unprocessable_entity
          end

          row = InternalFinancialSmokeTestService.authorize!(
            company_profile: company,
            actor: current_user,
            amount_cents: params[:amount_cents],
            reason: params[:authorization_reason]
          )
          render json: { smoke_test: serialize(row) }, status: :created
        rescue InternalFinancialSmokeTestService::Error => e
          render json: { error: e.message }, status: :unprocessable_entity
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Company not found" }, status: :not_found
        end

        # POST /api/v1/admin/internal_financial_smoke_tests/:id/execute
        def execute
          row = InternalFinancialSmokeTestService.execute_charge!(smoke_test: @smoke_test, actor: current_user)
          render json: { smoke_test: serialize(row) }, status: :ok
        rescue InternalFinancialSmokeTestService::Error => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        # POST /api/v1/admin/internal_financial_smoke_tests/:id/refund
        # Body: { refund_authorization_reason }
        def refund
          unless params[:refund_authorization_reason].to_s.strip.present?
            return render json: { error: "refund_authorization_reason is required" }, status: :unprocessable_entity
          end

          row = InternalFinancialSmokeTestService.refund!(
            smoke_test: @smoke_test,
            actor: current_user,
            reason: params[:refund_authorization_reason]
          )
          render json: { smoke_test: serialize(row) }, status: :ok
        rescue InternalFinancialSmokeTestService::Error => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        private

        def set_smoke_test
          @smoke_test = InternalFinancialSmokeTest.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Smoke test not found" }, status: :not_found
        end

        def serialize(row)
          {
            id: row.id,
            company_profile_id: row.company_profile_id,
            company_name: row.company_profile&.company_name,
            amount_cents: row.amount_cents,
            status: row.status,
            authorization_reason: row.authorization_reason,
            authorized_by_user_id: row.authorized_by_user_id,
            idempotency_key: row.idempotency_key,
            stripe_payment_intent_id: row.stripe_payment_intent_id,
            stripe_charge_id: row.stripe_charge_id,
            stripe_refund_id: row.stripe_refund_id,
            payment_method_type: row.payment_method_type,
            investigation_required: row.investigation_required,
            error_message: row.error_message,
            charge_initiated_at: row.charge_initiated_at&.iso8601,
            processing_at: row.processing_at&.iso8601,
            succeeded_at: row.succeeded_at&.iso8601,
            refunded_at: row.refunded_at&.iso8601,
            refund_authorization_reason: row.refund_authorization_reason,
            metadata_json: row.metadata_json,
            created_at: row.created_at&.iso8601,
            updated_at: row.updated_at&.iso8601
          }
        end
      end
    end
  end
end
