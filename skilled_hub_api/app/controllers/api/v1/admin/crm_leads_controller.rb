# frozen_string_literal: true

module Api
  module V1
    module Admin
      class CrmLeadsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_lead, only: %i[show update destroy]

        def index
          leads = CrmLead.order(updated_at: :desc)
          render json: { crm_leads: leads.map { |l| lead_json(l) } }, status: :ok
        end

        def show
          payload = { crm_lead: lead_json(@lead) }
          append_linked_payload(payload, @lead)
          render json: payload, status: :ok
        end

        def create
          lead = CrmLead.new(lead_params)
          if lead.save
            payload = { crm_lead: lead_json(lead) }
            append_linked_payload(payload, lead)
            render json: payload, status: :created
          else
            render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          if @lead.update(lead_params)
            payload = { crm_lead: lead_json(@lead) }
            append_linked_payload(payload, @lead)
            render json: payload, status: :ok
          else
            render json: { errors: @lead.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          @lead.destroy
          head :no_content
        end

        def import
          rows = params[:rows]
          unless rows.is_a?(Array)
            return render json: { error: "rows must be an array" }, status: :unprocessable_entity
          end

          created = []
          errors = []

          rows.each_with_index do |raw_row, idx|
            row = normalize_import_row(raw_row)
            lead = CrmLead.new(row)

            if lead.save
              created << lead
            else
              errors << {
                row: idx + 1,
                name: row[:name],
                errors: lead.errors.full_messages
              }
            end
          end

          render json: {
            imported_count: created.count,
            failed_count: errors.count,
            crm_leads: created.map { |l| lead_json(l) },
            errors: errors
          }, status: :ok
        end

        private

        def set_lead
          @lead = CrmLead.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "CRM record not found" }, status: :not_found
        end

        def lead_params
          p = params.permit(:name, :contact_name, :email, :phone, :website, :status, :notes, :linked_user_id, :linked_company_profile_id, company_types: [])
          p[:linked_user_id] = nil if p.key?(:linked_user_id) && p[:linked_user_id].blank?
          p[:linked_company_profile_id] = nil if p.key?(:linked_company_profile_id) && p[:linked_company_profile_id].blank?
          if p[:linked_company_profile_id].present? && p[:linked_user_id].blank?
            p[:linked_user_id] = User.find_by(company_profile_id: p[:linked_company_profile_id], role: :company)&.id
          elsif p[:linked_user_id].present? && p[:linked_company_profile_id].blank?
            p[:linked_company_profile_id] = User.find_by(id: p[:linked_user_id])&.company_profile&.id
          end
          p
        end

        def lead_json(lead)
          lu = lead.linked_user
          linked_profile = lead.linked_company_profile || lu&.company_profile
          {
            id: lead.id,
            name: lead.name,
            contact_name: lead.contact_name,
            email: lead.email,
            phone: lead.phone,
            website: lead.website,
            status: lead.status,
            company_types: lead.company_types || [],
            notes: lead.notes,
            linked_user_id: lead.linked_user_id,
            linked_company_profile_id: linked_profile&.id,
            created_at: lead.created_at,
            updated_at: lead.updated_at,
            linked_account: linked_account_json(lu, linked_profile)
          }
        end

        def linked_account_json(user, company_profile)
          return nil unless user || company_profile
          {
            user_id: user&.id,
            email: user&.email,
            company_profile_id: company_profile&.id,
            company_name: company_profile&.company_name,
            company_user_count: company_profile ? company_profile.company_users.where(role: :company).count : 0
          }
        end

        def append_linked_payload(payload, lead)
          cp = lead.linked_company_profile || lead.linked_user&.company_profile
          user = lead.linked_user || cp&.company_users&.where(role: :company)&.order(:id)&.first || cp&.user
          return unless cp

          payload[:linked_metrics] = CompanyMetrics.for_company_profile(cp)
          payload[:recent_jobs] = cp.jobs.order(created_at: :desc).limit(25).map do |j|
            {
              id: j.id,
              title: j.title,
              status: j.status,
              location: j.location,
              created_at: j.created_at,
              finished_at: j.finished_at
            }
          end
          payload[:activity] = {
            feedback_submissions_count: FeedbackSubmission.where(user_id: user.id).count,
            conversations_count: cp.conversations.count,
            messages_count: cp.messages.count
          }
        end

        def normalize_import_row(raw_row)
          row = raw_row.respond_to?(:to_unsafe_h) ? raw_row.to_unsafe_h : raw_row
          row = row.respond_to?(:to_h) ? row.to_h : {}
          normalized = row.transform_keys(&:to_s)

          allowed = %w[name contact_name email phone website status notes linked_user_id linked_company_profile_id company_types]
          payload = normalized.slice(*allowed).symbolize_keys

          payload[:status] = payload[:status].presence || "lead"
          payload[:company_types] =
            case payload[:company_types]
            when String
              payload[:company_types].split(/[,|;]/).map(&:strip).reject(&:blank?)
            when Array
              payload[:company_types].map(&:to_s).map(&:strip).reject(&:blank?)
            else
              []
            end
          payload[:linked_user_id] = payload[:linked_user_id].presence
          payload[:linked_company_profile_id] = payload[:linked_company_profile_id].presence
          payload
        end
      end
    end
  end
end
