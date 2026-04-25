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
                company_profile_id: provision_params[:company_profile_id],
                phone: provision_params[:phone],
                first_name: provision_params[:first_name],
                last_name: provision_params[:last_name]
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
                contact_name: provision_params[:contact_name],
                first_name: provision_params[:first_name],
                last_name: provision_params[:last_name]
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
          scope = CompanyProfile.includes(:company_users, :user)
          companies =
            if q.present?
              rank_company_matches(scope, q).first(30).map { |entry| entry[:company] }
            else
              scope.order(:company_name).limit(30)
            end
          render json: {
            companies: companies.map do |cp|
              {
                id: cp.id,
                company_name: cp.company_name,
                company_users_count: cp.company_users.where(role: :company).count,
                contact_first_name: cp.user&.first_name,
                contact_last_name: cp.user&.last_name
              }
            end
          }, status: :ok
        end

        private

        def provision_params
          params.permit(
            :email, :company_name, :industry, :location, :bio, :phone, :website_url, :company_profile_id,
            :facebook_url, :instagram_url, :linkedin_url, :contact_name, :first_name, :last_name,
            service_cities: []
          )
        end

        def rank_company_matches(scope, query)
          q_normalized = normalize_company_name(query)
          like = "%#{ActiveRecord::Base.sanitize_sql_like(query.downcase)}%"
          candidate_scope = scope.where("LOWER(company_profiles.company_name) LIKE ?", like)
          # Pull extra candidates for typo/case-insensitive fuzzy matching.
          candidate_scope = scope if candidate_scope.limit(1).empty?
          candidates = candidate_scope.order(:company_name).limit(300).to_a

          candidates.map do |cp|
            name = cp.company_name.to_s
            normalized = normalize_company_name(name)
            dist = levenshtein_distance(q_normalized, normalized)
            max_len = [q_normalized.length, normalized.length, 1].max
            distance_score = 1.0 - (dist.to_f / max_len)

            starts_with = normalized.start_with?(q_normalized) ? 1.0 : 0.0
            includes = normalized.include?(q_normalized) ? 1.0 : 0.0

            {
              company: cp,
              score: (starts_with * 3.0) + (includes * 1.5) + distance_score
            }
          end.sort_by { |entry| [-entry[:score], entry[:company].company_name.to_s.downcase] }
        end

        def normalize_company_name(value)
          value.to_s.downcase.gsub(/[^a-z0-9]/, "")
        end

        def levenshtein_distance(a, b)
          return b.length if a.empty?
          return a.length if b.empty?

          prev = (0..b.length).to_a
          curr = Array.new(b.length + 1, 0)

          a.each_char.with_index(1) do |a_char, i|
            curr[0] = i
            b.each_char.with_index(1) do |b_char, j|
              cost = a_char == b_char ? 0 : 1
              curr[j] = [curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost].min
            end
            prev, curr = curr, prev
          end

          prev[b.length]
        end
      end
    end
  end
end
