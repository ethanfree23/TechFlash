# frozen_string_literal: true

module Api
  module V1
    class TimeEntriesController < ApplicationController
      before_action :authenticate_user
      before_action :set_job

      def index
        entries = @job.time_entries.includes(:time_entry_pay_line).order(worked_start_at: :desc)
        render json: entries.as_json(include: :time_entry_pay_line), status: :ok
      end

      def create
        entry = @job.time_entries.new(time_entry_params)
        entry.submitted_by_user = @current_user
        entry.technician_profile = resolve_technician_profile(entry)
        entry.job_timezone = @job.job_timezone

        validator = TimeEntries::PolicyValidator.call(job: @job, time_entry: entry, actor_user: @current_user)
        unless validator.ok?
          return render json: { error: validator.error }, status: :unprocessable_entity
        end

        if entry.save
          create_pay_line!(entry, validator)
          if entry.override_applied?
            JobTermChangeAudit.create!(
              job: @job,
              actor_user: @current_user,
              change_type: "time_entry_override",
              reason: entry.override_reason,
              previous_values: {},
              new_values: {
                time_entry_id: entry.id,
                override_applied: true,
                override_by_user_id: entry.override_by_user_id || @current_user.id
              }
            )
          end
          render json: entry.as_json(include: :time_entry_pay_line), status: :created
        else
          render json: { errors: entry.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def approve
        entry = @job.time_entries.find(params[:id])
        return render_forbidden unless can_manage_job?(@job)

        entry.update!(status: :approved, approved_at: Time.current, approved_by_user: @current_user)
        render json: entry.as_json(include: :time_entry_pay_line), status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Time entry not found" }, status: :not_found
      end

      def reject
        entry = @job.time_entries.find(params[:id])
        return render_forbidden unless can_manage_job?(@job)

        entry.update!(status: :rejected)
        render json: entry.as_json(include: :time_entry_pay_line), status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Time entry not found" }, status: :not_found
      end

      private

      def set_job
        @job = Job.find(params[:job_id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def resolve_technician_profile(entry)
        if @current_user.technician?
          @current_user.technician_profile
        elsif @current_user.company? || @current_user.admin?
          if entry.technician_profile_id.present?
            TechnicianProfile.find(entry.technician_profile_id)
          else
            @job.job_applications.find_by(status: :accepted)&.technician_profile
          end
        end
      end

      def time_entry_params
        params.permit(:technician_profile_id, :weekend_work_request_id, :worked_start_at, :worked_end_at, :worked_on_date, :worked_hours,
                      :override_applied, :override_reason, :override_by_user_id)
      end

      def create_pay_line!(entry, validator)
        calculation = Compensation::Calculator.call(
          base_hourly_rate_cents: @job.hourly_rate_cents || 0,
          worked_hours: entry.worked_hours,
          overtime_multiplier: validator.overtime_multiplier,
          weekend_multiplier: validator.weekend_multiplier,
          premium_combination_rule: @job.premium_combination_rule
        )

        entry.create_time_entry_pay_line!(
          job: @job,
          base_hourly_rate_cents: calculation.base_hourly_rate_cents,
          overtime_multiplier: calculation.overtime_multiplier,
          weekend_multiplier: calculation.weekend_multiplier,
          applied_multiplier: calculation.applied_multiplier,
          effective_hourly_rate_cents: calculation.effective_hourly_rate_cents,
          worked_hours: calculation.worked_hours,
          gross_pay_cents: calculation.gross_pay_cents,
          premium_combination_rule: calculation.rule,
          calculation_details: {
            policy: calculation.rule,
            generated_at: Time.current.iso8601
          }
        )
      end

      def can_manage_job?(job)
        @current_user&.admin? || (@current_user&.company? && job.company_profile_id == @current_user.company_profile&.id)
      end

      def render_forbidden
        render json: { error: "Access denied" }, status: :forbidden
      end
    end
  end
end
