# frozen_string_literal: true

module Api
  module V1
    module Admin
      class MembershipTierConfigsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_config, only: %i[update destroy provision_stripe transfer_assignments]

        def index
          audience = parse_audience_param!
          configs = MembershipTierConfig.for_audience(audience)
          render json: { membership_tier_configs: configs.map { |c| serialize(c) } }, status: :ok
        rescue ArgumentError
          render json: { error: "audience must be technician or company" }, status: :bad_request
        end

        def create
          audience = parse_audience_body!
          config = MembershipTierConfig.new(create_attributes.merge(audience: audience))
          if config.save
            render json: { membership_tier_config: serialize(config) }, status: :created
          else
            render json: { errors: config.errors.full_messages }, status: :unprocessable_entity
          end
        rescue ArgumentError
          render json: { error: "audience must be technician or company" }, status: :bad_request
        end

        def update
          attrs = update_attributes
          attrs[:early_access_delay_hours] = nil unless @config.audience == "technician"
          attrs[:job_access_min_experience_years] = nil unless @config.audience == "technician"
          attrs[:job_access_min_jobs_completed] = nil unless @config.audience == "technician"
          attrs[:job_access_min_successful_jobs] = nil unless @config.audience == "technician"
          attrs[:job_access_min_profile_completeness_percent] = nil unless @config.audience == "technician"
          attrs[:job_access_requires_verified_background] = false unless @config.audience == "technician"

          if @config.update(attrs)
            render json: { membership_tier_config: serialize(@config) }, status: :ok
          else
            render json: { errors: @config.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          if MembershipTierConfig.where(audience: @config.audience).count <= 1
            return render json: { errors: ["Cannot delete the last tier for this audience."] }, status: :unprocessable_entity
          end
          if @config.in_use?
            assigned_users = assigned_users_for_config(@config)
            return render json: {
              errors: ["This tier is assigned to one or more profiles; reassign them before deleting."],
              error_code: "tier_in_use",
              tier: serialize(@config),
              assigned_users: assigned_users.first(100),
              total_assigned_users: assigned_users.length
            }, status: :unprocessable_entity
          end

          @config.destroy!
          head :no_content
        end

        def transfer_assignments
          target = MembershipTierConfig.find_by(id: params[:target_tier_id])
          if target.blank?
            return render json: { errors: ["Target tier not found"] }, status: :not_found
          end
          if target.id == @config.id
            return render json: { errors: ["Target tier must be different from source tier"] }, status: :unprocessable_entity
          end
          if target.audience != @config.audience
            return render json: { errors: ["Target tier must match audience"] }, status: :unprocessable_entity
          end

          moved_count = reassignment_scope_for_config(@config).update_all(membership_level: target.slug, updated_at: Time.current)
          render json: {
            message: "Reassigned #{moved_count} profiles from #{@config.slug} to #{target.slug}",
            moved_count: moved_count,
            from_tier: serialize(@config),
            to_tier: serialize(target)
          }, status: :ok
        end

        def provision_stripe
          result = MembershipTierStripeProvisioning.provision!(@config)
          render json: { membership_tier_config: serialize(@config.reload), **result }, status: :ok
        rescue MembershipTierStripeProvisioning::Error => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        private

        def set_config
          @config = MembershipTierConfig.find_by(id: params[:id])
          render json: { error: "Tier not found" }, status: :not_found if @config.blank?
        end

        def parse_audience_param!
          a = params[:audience].to_s
          raise ArgumentError unless MembershipTierConfig::AUDIENCES.include?(a)

          a
        end

        def parse_audience_body!
          a = params[:audience].to_s
          raise ArgumentError unless MembershipTierConfig::AUDIENCES.include?(a)

          a
        end

        def create_attributes
          p = params.permit(
            :slug, :display_name, :monthly_fee_cents, :yearly_fee_cents, :yearly_savings_label,
            :commission_percent, :early_access_delay_hours, :job_access_summary, :commission_summary,
            :is_highlighted, :active, :job_access_min_experience_years, :job_access_min_jobs_completed,
            :job_access_min_successful_jobs, :job_access_min_profile_completeness_percent,
            :job_access_requires_verified_background, :sort_order, :stripe_price_id, feature_bullets: []
          ).to_h
          p[:slug] = p[:slug].to_s.downcase.strip if p[:slug]
          p[:display_name] = p[:display_name].to_s.strip.presence
          p[:stripe_price_id] = p[:stripe_price_id].to_s.strip.presence
          p[:monthly_fee_cents] = p[:monthly_fee_cents].to_i if p.key?(:monthly_fee_cents)
          p[:yearly_fee_cents] = p[:yearly_fee_cents].to_i if p.key?(:yearly_fee_cents)
          p[:yearly_savings_label] = p[:yearly_savings_label].to_s.strip.presence if p.key?(:yearly_savings_label)
          p[:job_access_summary] = p[:job_access_summary].to_s.strip.presence if p.key?(:job_access_summary)
          p[:commission_summary] = p[:commission_summary].to_s.strip.presence if p.key?(:commission_summary)
          p[:is_highlighted] = ActiveModel::Type::Boolean.new.cast(p[:is_highlighted]) if p.key?(:is_highlighted)
          p[:active] = ActiveModel::Type::Boolean.new.cast(p[:active]) if p.key?(:active)
          if p.key?(:feature_bullets)
            p[:feature_bullets] = Array(p[:feature_bullets]).map { |s| s.to_s.strip }.reject(&:blank?)
          end
          p[:sort_order] = p[:sort_order].present? ? p[:sort_order].to_i : 0
          p[:commission_percent] = p[:commission_percent].to_f if p.key?(:commission_percent)
          if p.key?(:early_access_delay_hours)
            p[:early_access_delay_hours] =
              p[:early_access_delay_hours].present? ? p[:early_access_delay_hours].to_i : nil
          end
          if p.key?(:job_access_min_experience_years)
            p[:job_access_min_experience_years] =
              p[:job_access_min_experience_years].present? ? p[:job_access_min_experience_years].to_i : nil
          end
          if p.key?(:job_access_min_jobs_completed)
            p[:job_access_min_jobs_completed] =
              p[:job_access_min_jobs_completed].present? ? p[:job_access_min_jobs_completed].to_i : nil
          end
          if p.key?(:job_access_min_successful_jobs)
            p[:job_access_min_successful_jobs] =
              p[:job_access_min_successful_jobs].present? ? p[:job_access_min_successful_jobs].to_i : nil
          end
          if p.key?(:job_access_min_profile_completeness_percent)
            p[:job_access_min_profile_completeness_percent] =
              p[:job_access_min_profile_completeness_percent].present? ? p[:job_access_min_profile_completeness_percent].to_i : nil
          end
          p[:job_access_requires_verified_background] = ActiveModel::Type::Boolean.new.cast(p[:job_access_requires_verified_background]) if p.key?(:job_access_requires_verified_background)
          p
        end

        def update_attributes
          p = params.permit(
            :display_name, :monthly_fee_cents, :yearly_fee_cents, :yearly_savings_label,
            :commission_percent, :early_access_delay_hours, :job_access_summary, :commission_summary,
            :is_highlighted, :active, :job_access_min_experience_years, :job_access_min_jobs_completed,
            :job_access_min_successful_jobs, :job_access_min_profile_completeness_percent,
            :job_access_requires_verified_background, :sort_order, :stripe_price_id, feature_bullets: []
          ).to_h
          p[:display_name] = p[:display_name].to_s.strip.presence if p.key?(:display_name)
          p[:stripe_price_id] = p[:stripe_price_id].to_s.strip.presence if p.key?(:stripe_price_id)
          p[:monthly_fee_cents] = p[:monthly_fee_cents].to_i if p.key?(:monthly_fee_cents)
          p[:yearly_fee_cents] = p[:yearly_fee_cents].to_i if p.key?(:yearly_fee_cents)
          p[:yearly_savings_label] = p[:yearly_savings_label].to_s.strip.presence if p.key?(:yearly_savings_label)
          p[:job_access_summary] = p[:job_access_summary].to_s.strip.presence if p.key?(:job_access_summary)
          p[:commission_summary] = p[:commission_summary].to_s.strip.presence if p.key?(:commission_summary)
          p[:is_highlighted] = ActiveModel::Type::Boolean.new.cast(p[:is_highlighted]) if p.key?(:is_highlighted)
          p[:active] = ActiveModel::Type::Boolean.new.cast(p[:active]) if p.key?(:active)
          if p.key?(:feature_bullets)
            p[:feature_bullets] = Array(p[:feature_bullets]).map { |s| s.to_s.strip }.reject(&:blank?)
          end
          p[:sort_order] = p[:sort_order].to_i if p.key?(:sort_order)
          p[:commission_percent] = p[:commission_percent].to_f if p.key?(:commission_percent)
          if p.key?(:early_access_delay_hours)
            p[:early_access_delay_hours] =
              p[:early_access_delay_hours].present? ? p[:early_access_delay_hours].to_i : nil
          end
          if p.key?(:job_access_min_experience_years)
            p[:job_access_min_experience_years] =
              p[:job_access_min_experience_years].present? ? p[:job_access_min_experience_years].to_i : nil
          end
          if p.key?(:job_access_min_jobs_completed)
            p[:job_access_min_jobs_completed] =
              p[:job_access_min_jobs_completed].present? ? p[:job_access_min_jobs_completed].to_i : nil
          end
          if p.key?(:job_access_min_successful_jobs)
            p[:job_access_min_successful_jobs] =
              p[:job_access_min_successful_jobs].present? ? p[:job_access_min_successful_jobs].to_i : nil
          end
          if p.key?(:job_access_min_profile_completeness_percent)
            p[:job_access_min_profile_completeness_percent] =
              p[:job_access_min_profile_completeness_percent].present? ? p[:job_access_min_profile_completeness_percent].to_i : nil
          end
          p[:job_access_requires_verified_background] = ActiveModel::Type::Boolean.new.cast(p[:job_access_requires_verified_background]) if p.key?(:job_access_requires_verified_background)
          p
        end

        def serialize(config)
          {
            id: config.id,
            audience: config.audience,
            slug: config.slug,
            display_name: config.display_name,
            monthly_fee_cents: config.monthly_fee_cents,
            yearly_fee_cents: config.yearly_fee_cents,
            yearly_savings_label: config.yearly_savings_label,
            feature_bullets: Array(config.feature_bullets),
            job_access_summary: config.job_access_summary,
            commission_summary: config.commission_summary,
            commission_percent: config.commission_percent.to_f,
            early_access_delay_hours: config.early_access_delay_hours,
            job_access_min_experience_years: config.job_access_min_experience_years,
            job_access_min_jobs_completed: config.job_access_min_jobs_completed,
            job_access_min_successful_jobs: config.job_access_min_successful_jobs,
            job_access_min_profile_completeness_percent: config.job_access_min_profile_completeness_percent,
            job_access_requires_verified_background: config.job_access_requires_verified_background,
            sort_order: config.sort_order,
            stripe_price_id: config.stripe_price_id,
            is_highlighted: config.is_highlighted,
            active: config.active
          }
        end

        def reassignment_scope_for_config(config)
          if config.audience == "company"
            CompanyProfile.where(membership_level: config.slug)
          else
            TechnicianProfile.where(membership_level: config.slug)
          end
        end

        def assigned_users_for_config(config)
          if config.audience == "company"
            profiles = CompanyProfile.where(membership_level: config.slug).select(:id, :user_id, :company_name, :membership_level)
            profile_ids = profiles.map(&:id)
            owner_ids = profiles.map(&:user_id).compact
            return [] if profile_ids.empty? && owner_ids.empty?
            profile_by_id = profiles.index_by(&:id)
            profile_by_owner_id = profiles.index_by(&:user_id)
            users = User.where(role: :company).where("company_profile_id IN (?) OR id IN (?)", profile_ids, owner_ids).order(:email).distinct
            users.map do |u|
              profile = u.shared_company_profile || profile_by_id[u.company_profile_id] || profile_by_owner_id[u.id]
              {
                id: u.id,
                email: u.email,
                first_name: u.first_name,
                last_name: u.last_name,
                user_name: [u.first_name, u.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ").presence,
                role: u.role,
                company_profile_id: u.company_profile_id,
                membership_level: profile&.membership_level,
                company_name: profile&.company_name
              }
            end
          else
            User
              .joins(:technician_profile)
              .where(role: :technician, technician_profiles: { membership_level: config.slug })
              .order(:email)
              .select("users.*, technician_profiles.id AS technician_profile_id, technician_profiles.membership_level AS technician_membership_level, technician_profiles.trade_type AS technician_trade_type")
              .map do |u|
                {
                  id: u.id,
                  email: u.email,
                  first_name: u.first_name,
                  last_name: u.last_name,
                  user_name: [u.first_name, u.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ").presence,
                  role: u.role,
                  technician_profile_id: u.read_attribute(:technician_profile_id),
                  membership_level: u.read_attribute(:technician_membership_level),
                  trade_type: u.read_attribute(:technician_trade_type)
                }
              end
          end
        end
      end
    end
  end
end
