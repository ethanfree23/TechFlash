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
      TECHNICIAN_TRADE_OPTIONS = [
        'Electrician',
        'HVAC Technician',
        'Plumber',
        'Roofer',
        'Carpenter',
        'Machine Technician (Industrial Maintenance)',
        'Welder',
        'Refrigeration Technician',
        'Pipefitter',
        'Sheet Metal Worker',
        'Mason / Concrete Worker',
        'Drywall / Painter',
        'Glazier',
        'Insulation Installer',
        'Boilermaker',
        'Fire Protection / Sprinkler Tech',
        'Solar Installer',
        'Low-Voltage / Telecom Tech',
        'Locksmith',
        'Appliance Repair Tech',
        'Equipment Operator',
        'General Laborer / Helper'
      ].freeze

      before_action :authenticate_user, only: [:show, :update_me, :destroy_me, :blocked_users, :block_user, :unblock_user]

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

      def destroy_me
        user = @current_user
        user.destroy!
        head :no_content
      rescue StandardError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def blocked_users
        users = User.where(id: @current_user.blocked_user_ids).select(:id, :email, :first_name, :last_name, :role)
        render json: { blocked_users: users.as_json }, status: :ok
      end

      def block_user
        target = User.find(params[:blocked_user_id])
        if target.id == @current_user.id
          return render json: { error: "You cannot block yourself" }, status: :unprocessable_entity
        end

        ids = (@current_user.blocked_user_ids + [target.id]).uniq
        @current_user.update_blocked_user_ids!(ids)
        render json: { blocked_user_ids: @current_user.blocked_user_ids }, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "User not found" }, status: :not_found
      end

      def unblock_user
        ids = @current_user.blocked_user_ids - [params[:id].to_i]
        @current_user.update_blocked_user_ids!(ids)
        render json: { blocked_user_ids: @current_user.blocked_user_ids }, status: :ok
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
        owner_phone = params[:phone].to_s.strip
        phone = owner_phone
        city = params[:city].to_s.strip
        state = params[:state].to_s.strip
        zip_code = params[:zip_code].to_s.strip
        address = params[:address].to_s.strip
        country = params[:country].to_s.strip.presence || "United States"
        trade_type = params[:trade_type].to_s.strip

        if blocked_signup_email?(email) || params[:honeypot].to_s.present?
          block_marketing_email!(email)
          return render json: { error: "Registration is unavailable for this email." }, status: :forbidden
        end

        # Registration only allows technician or company; admin is created manually
        permitted_role = %w[technician company].include?(params[:role].to_s) ? params[:role] : 'technician'
        if permitted_role == 'company'
          phone = params[:business_phone].to_s.strip.presence || owner_phone
          city = params[:business_city].to_s.strip.presence || city
          state = params[:business_state].to_s.strip.presence || state
          zip_code = params[:business_zip_code].to_s.strip.presence || zip_code
          address = params[:business_address].to_s.strip.presence || address
        end
        return render json: { error: "first_name is required for signup" }, status: :unprocessable_entity if first_name.blank?
        return render json: { error: "last_name is required for signup" }, status: :unprocessable_entity if last_name.blank?
        return render json: { error: "phone is required for signup" }, status: :unprocessable_entity if phone.blank?
        return render json: { error: "city is required for signup" }, status: :unprocessable_entity if city.blank?
        return render json: { error: "state is required for signup" }, status: :unprocessable_entity if state.blank?
        return render json: { error: "zip_code is required for signup" }, status: :unprocessable_entity if zip_code.blank?
        if permitted_role == 'technician'
          if trade_type.blank?
            return render json: { error: "trade_type is required for technician signup" }, status: :unprocessable_entity
          end
          unless TECHNICIAN_TRADE_OPTIONS.include?(trade_type)
            return render json: { error: "trade_type must be selected from the role list" }, status: :unprocessable_entity
          end
        end

        if permitted_role == 'company'
          company_name = params[:company_name].to_s.strip
          if company_name.blank?
            return render json: { error: "company_name is required for company signup" }, status: :unprocessable_entity
          end
          industry = params[:industry].to_s.strip
          if industry.blank?
            return render json: { error: "industry is required for company signup" }, status: :unprocessable_entity
          end
          unless TECHNICIAN_TRADE_OPTIONS.include?(industry)
            return render json: { error: "industry must be selected from the trade list" }, status: :unprocessable_entity
          end
        end

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
              company_name: params[:company_name].to_s.strip,
              industry: params[:industry].to_s.strip,
              primary_hiring_need: params[:primary_hiring_need].to_s.strip.presence,
              membership_level: membership_level,
              phone: phone.presence,
              state: state.presence,
              service_cities: city.present? ? [city] : [],
              location: [
                address.presence,
                city.presence,
                [state.presence, zip_code.presence].compact.join(" ").presence
              ].compact.join(", ").presence,
              electrical_license_number: params[:electrical_license_number].to_s.strip.presence
            )
            unless profile.save
              user.destroy
              return render json: { errors: profile.errors.full_messages }, status: :unprocessable_entity
            end
            user.update_column(:company_profile_id, profile.id)
          elsif user.technician?
            specialties =
              case params[:specialties]
              when Array
                params[:specialties].map { |s| s.to_s.strip }.reject(&:blank?)
              when String
                begin
                  parsed = JSON.parse(params[:specialties])
                  parsed.is_a?(Array) ? parsed.map { |s| s.to_s.strip }.reject(&:blank?) : []
                rescue JSON::ParserError
                  []
                end
              else
                []
              end
            TechnicianProfile.create!(
              user: user,
              trade_type: trade_type,
              experience_years: 0,
              availability: 'Full-time',
              phone: phone,
              address: address.presence,
              city: city,
              state: state,
              zip_code: zip_code,
              country: country,
              membership_level: membership_level,
              specialties: specialties
            )
          end
          MailDelivery.safe_deliver { UserMailer.welcome_email(user).deliver_now }
          if user.technician?
            pref = JobAlertDispatcher.default_preference_for(user)
            pref.update!(trade_label: trade_type)
          end
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
          :trade_label, :min_hourly_rate_cents, :max_distance_miles, :min_duration_weeks, :max_duration_weeks,
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