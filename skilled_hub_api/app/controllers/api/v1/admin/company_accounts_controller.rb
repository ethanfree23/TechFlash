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
          p = provision_params
          result =
            if p[:company_profile_id].present?
              AdminAccountProvisioner.provision_company_login!(
                email: p[:email],
                company_profile_id: p[:company_profile_id],
                phone: p[:phone],
                first_name: p[:first_name],
                last_name: p[:last_name]
              )
            else
              cities = p[:service_cities]
              if cities.blank? && p[:location].present?
                cities = p[:location].to_s.split(",").map(&:strip).reject(&:blank?)
              end

              AdminAccountProvisioner.provision_company!(
                email: p[:email],
                company_name: p[:company_name],
                industry: p[:industry],
                bio: p[:bio],
                state: p[:state],
                electrical_license_number: p[:electrical_license_number],
                phone: p[:phone],
                website_url: p[:website_url],
                facebook_url: p[:facebook_url],
                instagram_url: p[:instagram_url],
                linkedin_url: p[:linkedin_url],
                service_cities: cities,
                contact_name: p[:contact_name],
                first_name: p[:first_name],
                last_name: p[:last_name],
                skip_auto_crm_lead: p[:crm_lead_id].present?
              )
            end

          link_crm_lead_after_provision!(result, p[:crm_lead_id]) if p[:crm_lead_id].present?

          render json: {
            user: UserSerializer.new(result[:user]).as_json,
            company_profile: CompanyProfileSerializer.new(result[:profile]).as_json
          }, status: :created
        rescue AdminAccountProvisioner::Error => e
          render json: { errors: [e.message] }, status: :unprocessable_entity
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        # POST /api/v1/admin/company_accounts/bulk_crm
        # Creates one company profile + first selected CRM contact as owner login, then optional additional
        # company logins for other selected contacts, links the CRM lead, and sets linked_user_id on contacts.
        def bulk_crm_create
          p = bulk_crm_params
          lead = CrmLead.find_by(id: p[:crm_lead_id].to_s.to_i)
          unless lead
            return render json: { errors: ["CRM lead not found"] }, status: :not_found
          end
          if lead.linked_company_profile_id.present? || lead.linked_user_id.present?
            return render json: { errors: ["CRM lead is already linked"] }, status: :unprocessable_entity
          end

          company = (p[:company] || {}).to_h.symbolize_keys
          rows = Array(p[:contacts]).map { |r| r.to_h.with_indifferent_access }
          rows = rows.reject { |r| r[:selected] == false || r[:selected] == "false" || r[:selected] == "0" }
          rows.sort_by! { |r| r[:contact_index].to_i }

          if rows.length < 1
            return render json: { errors: ["Select at least one CRM contact to provision"] }, status: :unprocessable_entity
          end

          emails = rows.map { |r| r[:email].to_s.strip.downcase }.reject(&:blank?)
          if emails.length != emails.uniq.length
            return render json: { errors: ["Each contact must have a unique email"] }, status: :unprocessable_entity
          end

          cities = company[:location].presence
          cities = cities.to_s.split(",").map(&:strip).reject(&:blank?) if cities.present?

          result = nil
          index_to_user = {}

          ActiveRecord::Base.transaction do
            first = rows.first
            fn, ln = bulk_contact_names(first)
            result = AdminAccountProvisioner.provision_company!(
              email: AdminAccountProvisioner.normalize_email(first[:email]),
              company_name: company[:company_name],
              industry: company[:industry],
              bio: company[:bio],
              state: company[:state],
              electrical_license_number: company[:electrical_license_number],
              phone: first[:phone].to_s.strip,
              website_url: company[:website_url],
              facebook_url: company[:facebook_url],
              instagram_url: company[:instagram_url],
              linkedin_url: company[:linkedin_url],
              service_cities: cities,
              contact_name: company[:contact_name],
              first_name: fn,
              last_name: ln,
              skip_auto_crm_lead: true
            )

            link_crm_lead_after_provision!(result, lead.id)
            index_to_user[first[:contact_index].to_i] = result[:user]

            rows.drop(1).each do |row|
              fn2, ln2 = bulk_contact_names(row)
              r2 = AdminAccountProvisioner.provision_company_login!(
                email: AdminAccountProvisioner.normalize_email(row[:email]),
                company_profile_id: result[:profile].id,
                phone: row[:phone].to_s.strip,
                first_name: fn2,
                last_name: ln2
              )
              index_to_user[row[:contact_index].to_i] = r2[:user]
            end

            lead.reload
            merged = merge_bulk_contact_linked_users(lead.contacts, index_to_user)
            lead.update!(contacts: merged)
          end

          render json: {
            user: UserSerializer.new(result[:user]).as_json,
            company_profile: CompanyProfileSerializer.new(result[:profile]).as_json,
            created_user_ids: index_to_user.values.map(&:id)
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

        def bulk_crm_params
          params.permit(
            :crm_lead_id,
            company: %i[
              company_name industry bio state website_url facebook_url instagram_url linkedin_url
              electrical_license_number contact_name location
            ],
            contacts: %i[contact_index email first_name last_name phone selected name]
          )
        end

        def bulk_contact_names(row)
          fn = row[:first_name].to_s.strip
          ln = row[:last_name].to_s.strip
          if fn.blank? && ln.blank?
            tokens = row[:name].to_s.strip.split(/\s+/).reject(&:blank?)
            fn = tokens[0].presence || "Company"
            ln = (tokens.length > 1 ? tokens[1..].join(" ") : "User")
          end
          [fn, ln]
        end

        def merge_bulk_contact_linked_users(contacts, index_to_user)
          return contacts if contacts.blank?

          arr = contacts.map do |entry|
            entry.is_a?(Hash) ? entry.stringify_keys : {}
          end
          index_to_user.each do |idx, user|
            i = idx.to_i
            next if i.negative? || i >= arr.length

            arr[i] = arr[i].merge("linked_user_id" => user.id)
          end
          arr
        end

        def provision_params
          params.permit(
            :email, :company_name, :industry, :location, :bio, :phone, :website_url, :company_profile_id,
            :facebook_url, :instagram_url, :linkedin_url, :contact_name, :first_name, :last_name,
            :state, :electrical_license_number, :crm_lead_id,
            service_cities: []
          )
        end

        # When CRM provisions from a lead row, persist the link on the lead in the same request.
        def link_crm_lead_after_provision!(result, crm_lead_id_raw)
          lead_id = crm_lead_id_raw.to_s.strip.to_i
          raise AdminAccountProvisioner::Error, "CRM lead not found" if lead_id <= 0

          lead = CrmLead.find_by(id: lead_id)
          raise AdminAccountProvisioner::Error, "CRM lead not found" unless lead

          user = result[:user]
          profile = result[:profile]
          lead.update!(
            linked_user_id: user.id,
            linked_company_profile_id: profile.id
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
