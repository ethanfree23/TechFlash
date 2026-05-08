module Api
  module V1
    class UsersController < ApplicationController
      # ui_preferences["table_columns"][table_id] => [{ "key", "visible" }, ...]
      UI_TABLE_COLUMNS_PERMIT = {
        admin_users: %i[key visible],
        admin_users_all: %i[key visible],
        admin_users_company: %i[key visible],
        admin_users_technician: %i[key visible],
        crm_pipeline: %i[key visible]
      }.freeze

      before_action :authenticate_user, only: [:show, :update_me]

      def update_me
        if params[:password].present?
          @current_user.password_set_actor = 'user'
        end

        # Saving only UI prefs must not run full validations (e.g. admin phone on :update).
        if ui_preferences_only_patch?
          merged_prefs = update_me_params["ui_preferences"]
          unless merged_prefs.is_a?(Hash)
            return render json: { errors: ["ui_preferences is invalid"] }, status: :unprocessable_entity
          end

          @current_user.update_columns(ui_preferences: merged_prefs, updated_at: Time.current)
          return render json: { user: UserSerializer.new(@current_user.reload).as_json }, status: :ok
        end

        if @current_user.update(update_me_params)
          if params[:job_alert_preference].present?
            pref = @current_user.job_alert_preference || @current_user.build_job_alert_preference
            pref.update!(job_alert_preference_params)
          end
          render json: { user: UserSerializer.new(@current_user).as_json }, status: :ok
        else
          render json: { errors: @current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def index
        users = User.all
        render json: users, each_serializer: UserSerializer, status: :ok
      end
      
      def show
        user = User.find(params[:id])
        render json: user, serializer: UserSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "User not found" }, status: :not_found
      end

      def create
        email = params[:email].to_s.strip.downcase
        first_name = params[:first_name].to_s.strip
        last_name = params[:last_name].to_s.strip
        phone = params[:phone].to_s.strip
        city = params[:city].to_s.strip
        state = params[:state].to_s.strip
        zip_code = params[:zip_code].to_s.strip
        address = params[:address].to_s.strip
        country = params[:country].to_s.strip.presence || "United States"

        if blocked_signup_email?(email) || params[:honeypot].to_s.present?
          block_marketing_email!(email)
          return render json: { error: "Registration is unavailable for this email." }, status: :forbidden
        end

        # Registration only allows technician or company; admin is created manually
        permitted_role = %w[technician company].include?(params[:role].to_s) ? params[:role] : 'technician'
        return render json: { error: "first_name is required for signup" }, status: :unprocessable_entity if first_name.blank?
        return render json: { error: "last_name is required for signup" }, status: :unprocessable_entity if last_name.blank?
        return render json: { error: "phone is required for signup" }, status: :unprocessable_entity if phone.blank?
        return render json: { error: "city is required for signup" }, status: :unprocessable_entity if city.blank?
        return render json: { error: "state is required for signup" }, status: :unprocessable_entity if state.blank?
        return render json: { error: "zip_code is required for signup" }, status: :unprocessable_entity if zip_code.blank?

        membership_level = MembershipPolicy.normalized_level(params[:membership_tier] || params[:membership_level], audience: permitted_role)
        unless MembershipPolicy.level_valid?(membership_level, audience: permitted_role)
          return render json: { error: "membership_tier is not valid for the selected role" }, status: :unprocessable_entity
        end
        unless payment_valid_for_tier?(membership_level, permitted_role)
          return render json: { error: "Valid payment is required for selected membership tier." }, status: :unprocessable_entity
        end

        user = User.new(user_params.merge(email: email, role: permitted_role, first_name: first_name, last_name: last_name))
        user.password_set_actor = 'user'
        if user.save
          if user.company?
            profile = CompanyProfile.new(
              user: user,
              membership_level: membership_level,
              phone: phone.presence,
              state: state.presence,
              service_cities: city.present? ? [city] : [],
              location: [city.presence, [state.presence, zip_code.presence].compact.join(" ")].compact.join(", ").presence,
              electrical_license_number: params[:electrical_license_number].to_s.strip.presence
            )
            unless profile.save
              user.destroy
              return render json: { errors: profile.errors.full_messages }, status: :unprocessable_entity
            end
            user.update_column(:company_profile_id, profile.id)
          elsif user.technician?
            TechnicianProfile.create!(
              user: user,
              trade_type: 'General',
              experience_years: 0,
              availability: 'Full-time',
              phone: phone,
              address: address.presence,
              city: city,
              state: state,
              zip_code: zip_code,
              country: country,
              membership_level: membership_level
            )
          end
          MailDelivery.safe_deliver { UserMailer.welcome_email(user).deliver_now }
          JobAlertDispatcher.default_preference_for(user) if user.technician?
          token = JWT.encode({ user_id: user.id }, Rails.application.secret_key_base, "HS256")
          render json: { token: token, user: UserSerializer.new(user).as_json }, status: :created
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def ui_preferences_only_patch?
        return false if params[:password].present?

        meaningful = params.keys.map(&:to_s) - %w[controller action format user]
        meaningful == ["ui_preferences"]
      end

      def user_params
        params.permit(
          :email, :password, :password_confirmation, :first_name, :last_name, :phone, :role
        )
      end

      def update_me_params
        p = params.permit(
          :email,
          :password,
          :password_confirmation,
          :first_name,
          :last_name,
          :phone,
          :email_notifications_enabled,
          :job_alert_notifications_enabled,
          email_notification_preferences: {},
          ui_preferences: {
            admin_users_table_columns: %i[key visible],
            table_columns: UI_TABLE_COLUMNS_PERMIT
          }
        ).to_h
        p.except!(:password, :password_confirmation) if p[:password].blank?
        if p.key?("email_notification_preferences")
          incoming = p["email_notification_preferences"].to_h
          merged = @current_user.email_notification_preferences_hash.merge(incoming.stringify_keys)
          p["email_notification_preferences"] = merged.to_json
        end
        if p.key?("ui_preferences")
          incoming = p["ui_preferences"].to_h.deep_stringify_keys
          if incoming["admin_users_table_columns"].present?
            incoming["table_columns"] ||= {}
            incoming["table_columns"]["admin_users"] ||= incoming["admin_users_table_columns"]
            incoming.delete("admin_users_table_columns")
          end
          merged = @current_user.ui_preferences_hash.deep_merge(incoming)
          merged.delete("admin_users_table_columns")
          p["ui_preferences"] = merged
        end
        p
      end

      def job_alert_preference_params
        params.require(:job_alert_preference).permit(
          :trade_label, :min_hourly_rate_cents, :max_distance_miles, :max_duration_days,
          :email_enabled, :sms_enabled, :app_enabled
        )
      end

      def blocked_signup_email?(email)
        MarketingLead.where(email: email, honeypot_triggered: true).exists?
      end

      def block_marketing_email!(email)
        return if email.blank?

        lead = MarketingLead.find_or_initialize_by(email: email)
        lead.honeypot_triggered = true
        lead.blocked_at ||= Time.current
        lead.save(validate: false)
      end

      def payment_valid_for_tier?(membership_level, role)
        rule = MembershipPolicy.rules_for_audience(role)[membership_level]
        return false unless rule

        return true if rule[:fee_cents].to_i <= 0

        intent_id = params[:signup_payment_intent_id].to_s
        return false if intent_id.blank? || Stripe.api_key.blank?

        intent = Stripe::PaymentIntent.retrieve(intent_id)
        return false unless intent.status == "succeeded"

        intent.metadata["membership_tier"] == membership_level
      rescue Stripe::StripeError
        false
      end
    end
  end
end 