module Api
  module V1
    class ApplicationController < ActionController::API
      include ActionController::HttpAuthentication::Token::ControllerMethods

      serialization_scope :current_user

      before_action :transform_json_params
      rescue_from StandardError, with: :handle_server_error

      def current_user
        @current_user
      end

      private

      def handle_server_error(exception)
        Rails.logger.error "#{exception.class}: #{exception.message}\n#{exception.backtrace.first(10).join("\n")}"
        render json: {
          error: "Server error",
          message: (Rails.env.development? ? "#{exception.class}: #{exception.message}" : nil)
        }, status: :internal_server_error
      end

      # Authenticates request using JWT token in Authorization header
      def authenticate_user
        authenticate_or_request_with_http_token do |token, _options|
          begin
            decoded_token = JWT.decode(token, Rails.application.secret_key_base)[0]
            @current_user = User.find(decoded_token["user_id"])
          rescue JWT::DecodeError, ActiveRecord::RecordNotFound
            head :unauthorized
          end
        end
      end
      
      # Role-based authorization methods
      def require_job_seeker
        unless @current_user&.technician?
          render json: { error: 'Access denied. Job seeker role required.' }, status: :forbidden
        end
      end
      
      def require_company
        unless @current_user&.company?
          render json: { error: 'Access denied. Company role required.' }, status: :forbidden
        end
      end
      
      def require_technician
        unless @current_user&.technician?
          render json: { error: 'Access denied. Technician role required.' }, status: :forbidden
        end
      end

      def require_admin
        unless @current_user&.admin?
          render json: { error: 'Access denied. Admin role required.' }, status: :forbidden
        end
      end

      # Allow JSON payloads to be parsed correctly into params (Rails API parses JSON by default; this ensures compatibility)
      def transform_json_params
        return unless request.content_type.to_s.include?('application/json')
        body = request.body.read
        return if body.blank?
        request.body.rewind
        json_params = JSON.parse(body)
        params.merge!(json_params) if json_params.is_a?(Hash)
      rescue JSON::ParserError, IOError
        # Rails will use its default parsing
      end
    end
  end
end 