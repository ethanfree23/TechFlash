module Api
  module V1
    class VerificationsController < ApplicationController
      before_action :authenticate_user
      before_action :require_technician

      def show
        profile = VerificationProfile.for_user!(@current_user)
        latest_background = BackgroundCheck.where(user_id: @current_user.id).order(created_at: :desc).first
        badges = VerificationBadge.active_now.where(user_id: @current_user.id).order(:badge_type)
        references = VerificationReference.where(technician_user_id: @current_user.id).order(created_at: :desc)
        approved_references_count = references.where(status: :approved).count

        render json: {
          verification_profile: profile,
          background_check: latest_background,
          badges: badges.map { |badge| serialize_badge(badge) },
          sections: sections_payload(profile: profile, background_check: latest_background, badges: badges, approved_references_count: approved_references_count),
          references_summary: {
            total_count: references.count,
            approved_count: approved_references_count,
            pending_count: references.where(status: %i[requested responded]).count
          }
        }, status: :ok
      end

      def start_background_check
        profile = VerificationProfile.for_user!(@current_user)
        client = CheckrClient.new
        selected_package = client.default_package.to_s.presence
        selected_node_custom_id = client.default_node_custom_id.to_s.presence
        if selected_package.blank?
          return render json: { error: "Background check package is not configured." }, status: :unprocessable_entity
        end
        context = resolve_background_check_context

        existing = BackgroundCheck.where(user_id: @current_user.id)
          .where("status IN (?) OR payment_status = ?", BackgroundCheck.statuses.values_at("invited", "pending", "processing"), BackgroundCheck.payment_statuses["pending"])
          .order(created_at: :desc)
          .first
        return render json: { error: "Background check already in progress." }, status: :unprocessable_entity if existing.present?

        membership_level = @current_user.technician_profile&.membership_level.to_s
        premium = membership_level == "premium"
        payment_status = premium ? :waived : :pending
        paid_by = premium ? "premium" : "technician"

        background_check = BackgroundCheck.create!(
          user_id: @current_user.id,
          provider: "checkr",
          package_name: selected_package,
          node_custom_id: selected_node_custom_id,
          work_location_country: context[:work_location][:country],
          work_location_state: context[:work_location][:state],
          work_location_city: context[:work_location][:city],
          job_id: context[:job]&.id,
          job_application_id: context[:job_application]&.id,
          company_profile_id: context[:job]&.company_profile_id,
          status: :not_started,
          normalized_status: "not_started",
          payment_status: payment_status,
          paid_by: paid_by
        )

        unless premium
          VerificationEventNotifier.background_payment_required(@current_user, background_check)
          return render json: {
            background_check: background_check,
            payment_required: true,
            message: "Payment is required before starting a background check."
          }, status: :ok
        end

        begin
          invitation = BackgroundCheckStartService.launch_checkr_invitation!(background_check)
          profile.update!(background_status: :pending)
          background_check_options = begin
            build_background_check_options
          rescue CheckrClient::Error => e
            {
              nodes_exist: false,
              selected_node_custom_id: selected_node_custom_id,
              nodes: [],
              packages: [],
              packages_available: false,
              package_filter_fallback: false,
              package_selection_reason: "checkr_options_unavailable",
              configured_package_name: selected_package,
              configured_node_custom_id: selected_node_custom_id,
              ready_for_start: false,
              options_error: e.message
            }
          end

          render json: {
            background_check: background_check.reload,
            payment_required: false,
            invitation_url: background_check.reload.invitation_url || invitation["invitation_url"],
            background_check_options: background_check_options
          }, status: :ok
        rescue BackgroundCheckStartService::Error => e
          background_check.update!(status: :failed, admin_notes: e.message)
          render json: { error: e.message }, status: :unprocessable_entity
        end
      end

      def background_check_options
        render json: build_background_check_options, status: :ok
      rescue CheckrClient::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def create_background_check_checkout
        background_check = BackgroundCheck.where(user_id: @current_user.id, payment_status: :pending).order(created_at: :desc).first
        return render json: { error: "No pending background check payment found." }, status: :unprocessable_entity if background_check.blank?
        if background_check.stripe_checkout_session_id.present?
          session = Stripe::Checkout::Session.retrieve(background_check.stripe_checkout_session_id)
          return render json: { checkout_url: session.url, background_check_id: background_check.id }, status: :ok
        end

        session = BackgroundCheckStartService.create_checkout_session!(background_check)
        render json: { checkout_url: session.url, background_check_id: background_check.id }, status: :ok
      rescue BackgroundCheckStartService::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      private

      def build_background_check_options
        client = CheckrClient.new
        raise CheckrClient::Error, "Checkr is not configured." unless client.configured?

        configured_package_name = client.default_package.to_s.presence
        configured_node_custom_id = client.default_node_custom_id.to_s.presence
        all_packages = client.list_packages
        nodes = client.list_nodes
        selected_node = resolve_configured_node(nodes, configured_node_custom_id)
        filtered_packages = filter_packages_for_node(all_packages, selected_node)
        configured_package_available = package_available?(all_packages, configured_package_name)
        package_selection_reason =
          if configured_package_available
            "configured_package_available"
          else
            "configured_package_missing"
          end
        selected_node_custom_id = selected_node&.dig("custom_id").presence || selected_node&.dig("id").presence

        {
          nodes_exist: nodes.any?,
          selected_node_custom_id: selected_node_custom_id,
          nodes: nodes.map { |node| serialize_node(node) },
          packages: filtered_packages.map { |pkg| serialize_package(pkg) },
          packages_available: filtered_packages.any?,
          package_filter_fallback: false,
          package_selection_reason: package_selection_reason,
          configured_package_name: configured_package_name,
          configured_node_custom_id: configured_node_custom_id,
          ready_for_start: configured_package_name.present? && configured_package_available
        }
      end

      def serialize_package(pkg)
        {
          id: pkg["id"],
          slug: pkg["slug"] || pkg["name"],
          name: pkg["name"] || pkg["slug"] || pkg["id"],
          screenings: pkg["screenings"],
          tier: pkg["tier"]
        }
      end

      def serialize_node(node)
        {
          id: node["id"],
          custom_id: node["custom_id"],
          value: node["custom_id"].presence || node["id"],
          name: node["name"] || node["custom_id"] || node["id"],
          package_ids: Array(node["package_ids"]).compact,
          package_slugs: Array(node["package_slugs"]).compact
        }
      end

      def filter_packages_for_node(packages, node)
        return packages if node.blank?

        package_ids = Array(node["package_ids"]).map(&:to_s).reject(&:blank?)
        package_slugs = Array(node["package_slugs"]).map { |slug| normalize_key(slug) }.reject(&:blank?)
        node_packages = Array(node["packages"])
        if node_packages.any?
          package_ids |= node_packages.map { |pkg| pkg["id"].to_s }.reject(&:blank?)
          package_slugs |= node_packages.map { |pkg| normalize_key(pkg["slug"] || pkg["name"]) }.reject(&:blank?)
        end

        return packages if package_ids.blank? && package_slugs.blank?

        packages.select do |pkg|
          package_ids.include?(pkg["id"].to_s) || package_slugs.include?(normalize_key(pkg["slug"] || pkg["name"]))
        end
      end

      def package_available?(packages, configured_package_name)
        return false if configured_package_name.blank?

        normalized_configured_package = normalize_key(configured_package_name)
        packages.any? do |pkg|
          normalize_key(pkg["slug"]) == normalized_configured_package ||
            normalize_key(pkg["name"]) == normalized_configured_package ||
            normalize_key(pkg["id"]) == normalized_configured_package
        end
      end

      def resolve_configured_node(nodes, configured_node_custom_id)
        return nil if configured_node_custom_id.blank?

        normalized_configured_node = normalize_key(configured_node_custom_id)
        nodes.find do |node|
          normalize_key(node["custom_id"]) == normalized_configured_node ||
            normalize_key(node["id"]) == normalized_configured_node
        end
      end

      def normalize_key(value)
        value.to_s.strip.downcase
      end

      def resolve_background_check_context
        job = nil
        job_application = nil
        if params[:job_application_id].present?
          job_application = JobApplication.find_by(id: params[:job_application_id], technician_profile_id: @current_user.technician_profile&.id)
          job = job_application&.job
        elsif params[:job_id].present?
          job = Job.find_by(id: params[:job_id])
          job_application = JobApplication.find_by(job_id: job&.id, technician_profile_id: @current_user.technician_profile&.id)
        end

        work_location = {
          country: job&.country.presence || @current_user.technician_profile&.country.presence || "US",
          state: job&.state.presence || @current_user.technician_profile&.state.presence || "TX",
          city: job&.city.presence || @current_user.technician_profile&.city.presence || "Houston"
        }

        { job: job, job_application: job_application, work_location: work_location }
      end

      def sections_payload(profile:, background_check:, badges:, approved_references_count:)
        active_badge_types = badges.map(&:badge_type)
        [
          {
            key: "identity",
            title: "Identity Verification",
            status: profile.identity_status,
            cta: profile.identity_status.to_s == "verified" ? nil : "Start verification",
            why_it_matters: "Companies use identity verification to reduce onsite risk.",
            badge_preview: "ID Verified",
            last_updated_at: profile.updated_at
          },
          {
            key: "background_check",
            title: "Background Check",
            status: (background_check&.normalized_status_value || "not_started"),
            provider_status: background_check&.provider_status,
            provider_assess_status: background_check&.provider_assess_status,
            package_name: background_check&.package_name,
            invitation_url: background_check&.invitation_url,
            report_eta_at: background_check&.report_eta_at,
            work_location: {
              country: background_check&.work_location_country,
              state: background_check&.work_location_state,
              city: background_check&.work_location_city
            },
            report_url: background_check&.report_url,
            dashboard_url: background_check&.dashboard_url,
            cta: background_check.present? ? "View status" : "Start background check",
            why_it_matters: "Some companies only allow background-checked technicians to claim jobs.",
            badge_preview: "Background Checked",
            last_updated_at: background_check&.updated_at,
            renewal_at: background_check&.expires_at
          },
          {
            key: "references",
            title: "References",
            status: profile.references_status,
            cta: "Add references",
            why_it_matters: "Verified references help companies trust your reliability.",
            badge_preview: active_badge_types.include?("references_verified") ? "#{approved_references_count} References Verified" : "2 References Verified",
            last_updated_at: profile.updated_at
          },
          {
            key: "licenses",
            title: "Licenses and Certifications",
            status: profile.licenses_status,
            cta: "Upload documents",
            why_it_matters: "Trade-specific licenses improve discoverability and eligibility.",
            badge_preview: "Licensed / Certified",
            last_updated_at: profile.updated_at
          },
          {
            key: "insurance",
            title: "Insurance Documents",
            status: profile.insurance_status,
            cta: "Upload insurance",
            why_it_matters: "Insurance verification is required on many enterprise worksites.",
            badge_preview: "Insured",
            last_updated_at: profile.updated_at
          }
        ]
      end

      def serialize_badge(badge)
        {
          id: badge.id,
          badge_type: badge.badge_type,
          status: badge.status,
          earned_at: badge.earned_at,
          expires_at: badge.expires_at
        }
      end
    end
  end
end
