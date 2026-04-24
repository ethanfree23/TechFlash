# frozen_string_literal: true

module Api
  module V1
    module Admin
      class CompanyAccountsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # POST /api/v1/admin/company_accounts
        # Creates either:
        # - a new company user + company profile, or
        # - an additional company user under an existing company_profile_id.
        def create
          result =
            if provision_params[:company_profile_id].present?
              AdminAccountProvisioner.provision_company_login!(
                email: provision_params[:email],
                company_profile_id: provision_params[:company_profile_id]
              )
            else
              cities = provision_params[:service_cities]
              if cities.blank? && provision_params[:location].present?
                cities = provision_params[:location].to_s.split(",").map(&:strip).reject(&:blank?)
              end

              AdminAccountProvisioner.provision_company!(
                email: provision_params[:email],
                company_name: provision_params[:company_name],
                industry: provision_params[:industry],
                bio: provision_params[:bio],
                phone: provision_params[:phone],
                website_url: provision_params[:website_url],
                facebook_url: provision_params[:facebook_url],
                instagram_url: provision_params[:instagram_url],
                linkedin_url: provision_params[:linkedin_url],
                service_cities: cities,
                contact_name: provision_params[:contact_name]
              )
            end

          render json: {
            user: UserSerializer.new(result[:user]).as_json,
            company_profile: CompanyProfileSerializer.new(result[:profile]).as_json
          }, status: :created
        rescue AdminAccountProvisioner::Error => e
          render json: { errors: [e.message] }, status: :unprocessable_entity
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        # GET /api/v1/admin/company_accounts/search?q=
        def search
          q = params[:q].to_s.strip
          if q.blank?
            return render json: { users: [] }, status: :ok
          end

          scope = User.company.includes(:company_profile)
          like = "%#{ActiveRecord::Base.sanitize_sql_like(q.downcase)}%"
          scope = scope.where("LOWER(users.email) LIKE ?", like)
          users = scope.order(:email).limit(30)
          render json: {
            users: users.map do |u|
              cp = u.company_profile
              {
                id: u.id,
                email: u.email,
                company_profile_id: cp&.id,
                company_name: cp&.company_name
              }
            end
          }, status: :ok
        end

        # GET /api/v1/admin/company_accounts/search_companies?q=
        def search_companies
          q = params[:q].to_s.strip
          scope = CompanyProfile.includes(:company_users)
          if q.present?
            like = "%#{ActiveRecord::Base.sanitize_sql_like(q.downcase)}%"
            scope = scope.where("LOWER(company_profiles.company_name) LIKE ?", like)
          end
          companies = scope.order(:company_name).limit(30)
          render json: {
            companies: companies.map do |cp|
              {
                id: cp.id,
                company_name: cp.company_name,
                company_users_count: cp.company_users.where(role: :company).count
              }
            end
          }, status: :ok
        end

        private

        def provision_params
          params.permit(
            :email, :company_name, :industry, :location, :bio, :phone, :website_url, :company_profile_id,
            :facebook_url, :instagram_url, :linkedin_url, :contact_name,
            service_cities: []
          )
        end
      end
    end
  end
end
