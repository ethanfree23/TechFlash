# frozen_string_literal: true

module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # GET /api/v1/admin/users?q=&role=
        # role: all | technician | company (default all)
        def index
          scope = User.where(role: %i[technician company]).includes(:technician_profile, :company_profile).order(:email)
          scope = filter_by_role(scope)
          scope = filter_by_search(scope)

          users = scope.map { |u| list_item(u) }
          render json: { users: users }, status: :ok
        end

        # GET /api/v1/admin/users/:id?period=7d
        def show
          result = AdminUserDetail.call(user_id: params[:id].to_i, period: params[:period])
          if result[:error]
            status = result[:error] == "User not found" ? :not_found : :unprocessable_entity
            render json: { error: result[:error] }, status: status
          else
            render json: result, status: :ok
          end
        end

        # POST /api/v1/admin/users — JSON or multipart (company + logo)
        def create
          role = params[:role].to_s
          begin
            case role
            when "company"
              result =
                if params[:company_profile_id].present?
                  AdminAccountProvisioner.provision_company_login!(
                    email: params[:email],
                    company_profile_id: params[:company_profile_id],
                    phone: params[:phone],
                    first_name: params[:first_name],
                    last_name: params[:last_name],
                    password: params[:password],
                    password_confirmation: params[:password_confirmation]
                  )
                else
                  AdminAccountProvisioner.provision_company!(
                    email: params[:email],
                    company_name: params[:company_name],
                    industry: params[:industry],
                    bio: params[:bio],
                    website_url: params[:website_url],
                    facebook_url: params[:facebook_url],
                    instagram_url: params[:instagram_url],
                    linkedin_url: params[:linkedin_url],
                    service_cities: parse_service_cities_param,
                    logo: params[:logo],
                    contact_name: params[:contact_name],
                    phone: params[:phone],
                    first_name: params[:first_name],
                    last_name: params[:last_name],
                    password: params[:password],
                    password_confirmation: params[:password_confirmation]
                  )
                end
            when "technician"
              result = AdminAccountProvisioner.provision_technician!(
                email: params[:email],
                trade_type: params[:trade_type],
                location: params[:location],
                experience_years: params[:experience_years],
                availability: params[:availability],
                bio: params[:bio],
                phone: params[:phone],
                first_name: params[:first_name],
                last_name: params[:last_name],
                password: params[:password],
                password_confirmation: params[:password_confirmation]
              )
            else
              return render json: { errors: ["role must be company or technician"] }, status: :unprocessable_entity
            end
          rescue AdminAccountProvisioner::Error => e
            return render json: { errors: [e.message] }, status: :unprocessable_entity
          end

          user = result[:user]
          profile = result[:profile]
          payload =
            if role == "company"
              {
                user: UserSerializer.new(user).as_json,
                company_profile: profile.as_json(
                  only: %i[
                    id company_name industry location bio phone website_url facebook_url instagram_url linkedin_url
                    service_cities user_id created_at updated_at
                  ]
                ).merge("avatar_url" => company_avatar_url(profile))
              }
            else
              {
                user: UserSerializer.new(user).as_json,
                technician_profile: profile.as_json(
                  only: %i[id trade_type location experience_years availability bio user_id created_at updated_at]
                )
              }
            end

          render json: payload, status: :created
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        # POST /api/v1/admin/users/:id/password_setup
        # Generates a new password setup link and optionally emails it.
        def password_setup
          user = provisioned_user!
          return if user.nil?
          user.generate_password_reset_token!
          send_email = ActiveModel::Type::Boolean.new.cast(params.fetch(:send_email, true))

          if send_email
            MailDelivery.safe_deliver do
              UserMailer.password_reset_instructions(user, reason: :admin_provisioned).deliver_now
            end
          end

          render json: {
            message: send_email ? "Password setup email sent" : "Password setup link generated",
            reset_url: frontend_reset_password_url(user.password_reset_token),
            expires_in_hours: (User::PASSWORD_RESET_EXPIRY / 1.hour).to_i
          }, status: :ok
        end

        # PATCH /api/v1/admin/users/:id/password
        # Directly sets a new password for a provisioned account.
        def set_password
          user = provisioned_user!
          return if user.nil?
          password = params[:password].to_s
          password_confirmation = params[:password_confirmation].to_s

          unless PasswordStrength.valid?(password)
            return render json: { errors: [PasswordStrength::REQUIREMENT_TEXT] }, status: :unprocessable_entity
          end

          user.password = password
          user.password_confirmation = password_confirmation
          user.password_set_actor = "admin"
          if user.save
            user.clear_password_reset_token!
            render json: { message: "Password updated for #{user.email}" }, status: :ok
          else
            render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/users/:id/company_membership
        # Links a company contact account to an existing company profile.
        def company_membership
          user = provisioned_user!
          return if user.nil?
          return render json: { errors: ["Only company users can be linked"] }, status: :unprocessable_entity unless user.company?

          profile_id = params[:company_profile_id].to_i
          profile = CompanyProfile.find_by(id: profile_id)
          return render json: { errors: ["Company profile not found"] }, status: :not_found unless profile

          user.update!(company_profile_id: profile.id)
          render json: {
            message: "Company membership updated",
            user: list_item(user.reload),
            company_profile: {
              id: profile.id,
              company_name: profile.company_name
            }
          }, status: :ok
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        # PATCH /api/v1/admin/users/:id/profile
        # Updates company or technician profile fields (admin only).
        def update_profile
          user = provisioned_user!
          return if user.nil?

          user_attrs = user_admin_params.to_h.transform_values { |v| v.is_a?(String) ? v.strip.presence : v }
          user.update!(user_attrs) if user_attrs.any?

          if user.company?
            cp = user.company_profile
            return render json: { errors: ["Company profile not found"] }, status: :not_found unless cp

            unless cp.update(company_profile_admin_params)
              return render json: { errors: cp.errors.full_messages }, status: :unprocessable_entity
            end
          elsif user.technician?
            tp = user.technician_profile
            return render json: { errors: ["Technician profile not found"] }, status: :not_found unless tp

            attrs = technician_profile_admin_params
            unless tp.update(attrs)
              return render json: { errors: tp.errors.full_messages }, status: :unprocessable_entity
            end
          else
            return render json: { errors: ["This account has no editable profile"] }, status: :unprocessable_entity
          end

          render json: { message: "Profile updated" }, status: :ok
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        # POST /api/v1/admin/users/:id/ensure_profile
        # Creates a missing technician/company profile and links it.
        def ensure_profile
          user = provisioned_user!
          return if user.nil?

          profile =
            if user.company?
              ensure_company_profile_for(user)
            elsif user.technician?
              user.technician_profile || TechnicianProfile.create!(user_id: user.id)
            else
              return render json: { errors: ["This account has no editable profile"] }, status: :unprocessable_entity
            end

          render json: {
            message: "Profile is ready",
            profile_type: user.company? ? "company" : "technician",
            profile_id: profile.id
          }, status: :ok
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        # PATCH /api/v1/admin/users/:id/membership_pricing
        def membership_pricing
          user = provisioned_user!
          return if user.nil?

          profile =
            if user.company?
              user.company_profile
            elsif user.technician?
              user.technician_profile
            end
          return render json: { errors: ["Membership profile not found"] }, status: :not_found if profile.blank?

          attrs = {}
          if params.key?(:membership_level)
            aud = user.company? ? :company : :technician
            level = MembershipPolicy.normalized_level(params[:membership_level], audience: aud)
            unless MembershipPolicy.level_valid?(level, audience: aud)
              allowed = MembershipPolicy.slugs_for_audience(aud).join(", ")
              return render json: { errors: ["membership_level must be one of: #{allowed}"] }, status: :unprocessable_entity
            end
            attrs[:membership_level] = level
          end
          if params.key?(:membership_fee_override_cents)
            value = params[:membership_fee_override_cents]
            attrs[:membership_fee_override_cents] = value.present? ? value.to_i : nil
          end
          if params.key?(:commission_override_percent)
            value = params[:commission_override_percent]
            attrs[:commission_override_percent] = value.present? ? value.to_f : nil
          end
          if params.key?(:membership_fee_waived)
            attrs[:membership_fee_waived] = ActiveModel::Type::Boolean.new.cast(params[:membership_fee_waived])
          end

          profile.update!(attrs) if attrs.any?

          render json: {
            message: "Membership pricing updated",
            user: list_item(user.reload),
            membership: membership_payload(user: user, profile: profile.reload)
          }, status: :ok
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        private

        def company_profile_admin_params
          params.permit(
            :company_name, :industry, :location, :bio, :phone,
            :website_url, :facebook_url, :instagram_url, :linkedin_url,
            service_cities: []
          )
        end

        def user_admin_params
          params.permit(:first_name, :last_name)
        end

        def technician_profile_admin_params
          p = params.permit(
            :trade_type,
            :location,
            :availability,
            :bio,
            :phone,
            :experience_years,
            :address,
            :city,
            :state,
            :zip_code,
            :country,
            :background_verified
          )
          if p.key?(:experience_years)
            raw = p[:experience_years]
            p[:experience_years] = raw.present? ? raw.to_i : nil
          end
          if p.key?(:background_verified)
            p[:background_verified] = ActiveModel::Type::Boolean.new.cast(p[:background_verified])
          end
          p
        end

        def provisioned_user!
          user = User.find_by(id: params[:id].to_i)
          if user.blank? || user.admin?
            render json: { errors: ["User not found"] }, status: :not_found
            return
          end
          user
        end

        def ensure_company_profile_for(user)
          profile = user.company_profile || CompanyProfile.create!(user_id: user.id)
          if user.company_profile_id != profile.id
            user.update_column(:company_profile_id, profile.id)
          end
          profile
        end

        def frontend_reset_password_url(token)
          base = ENV.fetch("FRONTEND_URL", "http://localhost:5173").chomp("/")
          "#{base}/reset-password?token=#{CGI.escape(token)}"
        end

        def company_avatar_url(profile)
          return nil unless profile.avatar.attached?

          Rails.application.routes.url_helpers.rails_blob_url(profile.avatar)
        rescue StandardError
          nil
        end

        def parse_service_cities_param
          raw = params[:service_cities]
          return [] if raw.blank?

          if raw.is_a?(Array)
            return raw.map(&:to_s).map(&:strip).reject(&:blank?).uniq
          end

          if raw.is_a?(ActionController::Parameters)
            return raw.to_unsafe_h.sort_by { |k, _| k.to_s.to_i }.map { |_, v| v.to_s.strip }.reject(&:blank?).uniq
          end

          if raw.is_a?(String)
            begin
              parsed = JSON.parse(raw)
              return parsed.is_a?(Array) ? parsed.map(&:to_s).map(&:strip).reject(&:blank?).uniq : []
            rescue JSON::ParserError
              return raw.split(",").map(&:strip).reject(&:blank?).uniq
            end
          end

          []
        end

        def filter_by_role(scope)
          case params[:role].to_s
          when "technician"
            scope.where(role: :technician)
          when "company"
            scope.where(role: :company)
          else
            scope
          end
        end

        def filter_by_search(scope)
          q = params[:q].to_s.strip
          return scope if q.blank?

          like = "%#{ActiveRecord::Base.sanitize_sql_like(q.downcase)}%"
          scope.left_joins(:company_profile, :technician_profile).where(
            "LOWER(users.email) LIKE :like OR LOWER(COALESCE(users.first_name, '')) LIKE :like OR LOWER(COALESCE(users.last_name, '')) LIKE :like OR LOWER(COALESCE(company_profiles.company_name, '')) LIKE :like OR LOWER(COALESCE(technician_profiles.trade_type, '')) LIKE :like",
            like: like
          )
        end

        def list_item(user)
          company_name = user.company_profile&.company_name
          user_name = [user.first_name, user.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ")
          {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.phone,
            user_name: user_name.presence,
            role: user.role,
            created_at: user.created_at&.iso8601,
            label: user_list_label(user),
            company_name: company_name,
            technician_profile_id: user.technician_profile&.id,
            company_profile_id: user.company_profile&.id
          }
        end

        def membership_payload(user:, profile:)
          monthly_fee_cents =
            if user.company?
              MembershipPolicy.company_monthly_fee_cents(profile)
            else
              MembershipPolicy.technician_monthly_fee_cents(profile)
            end

          commission_percent =
            if user.company?
              MembershipPolicy.company_commission_percent(profile)
            else
              MembershipPolicy.technician_commission_percent(profile)
            end

          {
            membership_level: profile.membership_level,
            monthly_fee_cents: monthly_fee_cents,
            commission_percent: commission_percent,
            membership_fee_override_cents: profile.membership_fee_override_cents,
            commission_override_percent: profile.commission_override_percent,
            membership_fee_waived: profile.membership_fee_waived,
            membership_status: profile.membership_status,
            membership_current_period_end_at: profile.membership_current_period_end_at
          }
        end

        def user_list_label(user)
          if user.company?
            user.company_profile&.company_name.presence || "Company"
          elsif user.technician?
            user.technician_profile&.trade_type.presence || "Technician"
          else
            user.role
          end
        end
      end
    end
  end
end
