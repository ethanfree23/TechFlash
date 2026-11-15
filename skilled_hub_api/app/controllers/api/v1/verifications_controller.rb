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
        acknowledgements = BackgroundCheckAcknowledgement.payload_for(@current_user)

        render json: {
          verification_profile: profile,
          background_check: serialize_background_check_for_technician(latest_background),
          background_check_acknowledgements: acknowledgements,
          badges: badges.map { |badge| serialize_badge(badge) },
          sections: sections_payload(profile: profile, background_check: latest_background, badges: badges, approved_references_count: approved_references_count),
          references_summary: {
            total_count: references.count,
            approved_count: approved_references_count,
            pending_count: references.where(status: %i[requested responded]).count
          }
        }, status: :ok
      end

      # Persist one TechFlash acknowledgement immediately (not Checkr FCRA consent).
      def background_check_acknowledgements
        type = params[:acknowledgement_type].to_s
        accepted = ActiveModel::Type::Boolean.new.cast(params[:accepted])
        row = BackgroundCheckAcknowledgementService.upsert!(
          user: @current_user,
          acknowledgement_type: type,
          accepted: accepted,
          actor_user: @current_user,
          ip_address: request.remote_ip,
          user_agent: request.user_agent
        )
        render json: {
          acknowledgement: {
            acknowledgement_type: row.acknowledgement_type,
            document_version: row.document_version,
            accepted: row.accepted,
            accepted_at: row.accepted_at,
            copy: BackgroundCheckAcknowledgement.copy_for(row.acknowledgement_type)
          },
          background_check_acknowledgements: BackgroundCheckAcknowledgement.payload_for(@current_user)
        }, status: :ok
      rescue BackgroundCheckAcknowledgementService::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end

      def start_background_check
        profile = VerificationProfile.for_user!(@current_user)
        checkr_configuration = CheckrConfiguration.new
        demo_bypass = checkr_demo_bypass_enabled?
        client = CheckrClient.new
        selected_package = checkr_configuration.default_package.to_s.presence
        selected_node_custom_id = client.default_node_custom_id.to_s.presence

        if selected_package.blank?
          return render json: {
            error: "Background check package is not configured. Set CHECKR_DEFAULT_PACKAGE to a package available on this Checkr account.",
            code: "checkr_package_unconfigured"
          }, status: :unprocessable_entity
        end
        unless demo_bypass || checkr_configuration.requests_allowed?
          return render json: {
            error: checkr_configuration.requests_block_reason || "Checkr integration is disabled."
          }, status: :unprocessable_entity
        end

        unless BackgroundCheckAcknowledgement.required_accepted?(@current_user)
          return render json: {
            error: "Accept the required TechFlash acknowledgements before starting a background check.",
            code: "acknowledgements_required",
            background_check_acknowledgements: BackgroundCheckAcknowledgement.payload_for(@current_user)
          }, status: :unprocessable_entity
        end

        context = resolve_background_check_context(fail_closed: true)
        if context[:work_location_error].present?
          return render json: { error: context[:work_location_error], code: "work_location_required" }, status: :unprocessable_entity
        end

        if BackgroundCheck.invitation_outcome_unknown.where(user_id: @current_user.id).exists?
          return render json: {
            error: "A previous invitation attempt needs reconciliation before another Checkr order can be created. Contact support.",
            code: "invitation_outcome_unknown"
          }, status: :unprocessable_entity
        end

        # Existing clear/report already ordered — never create another billable Checkr report.
        existing_clear = BackgroundCheck.where(user_id: @current_user.id).order(created_at: :desc).detect(&:eligible_for_background_gate?)
        if existing_clear.present?
          return render json: {
            error: "A clear background check is already on file.",
            code: "already_verified",
            background_check: serialize_background_check_for_technician(existing_clear),
            payment_required: false
          }, status: :unprocessable_entity
        end
        if BackgroundCheck.where(user_id: @current_user.id).where.not(provider_report_id: [nil, ""]).where(status: %i[pending processing consider suspended clear]).exists?
          return render json: {
            error: "A Checkr report already exists for this technician. A new invitation was not created.",
            code: "report_already_exists",
            payment_required: false
          }, status: :unprocessable_entity
        end

        existing = BackgroundCheck.where(user_id: @current_user.id)
          .where(status: BackgroundCheck.statuses.values_at("invited", "pending", "processing", "suspended"))
          .order(created_at: :desc)
          .first
        if existing.present?
          # Repeated clicks reuse the in-flight invitation (no second billable order).
          return render json: {
            background_check: serialize_background_check_for_technician(existing),
            invitation_url: existing.invitation_url,
            payment_required: false,
            reused_existing_invitation: true,
            message: "Background check already in progress. Continue with the existing Checkr invitation."
          }, status: :ok
        end

        # Expired invitations: reconcile authoritative Checkr state before issuing a new one.
        expired = BackgroundCheck.where(user_id: @current_user.id, normalized_status: %w[invitation_expired invitation_deleted])
          .order(created_at: :desc)
          .first
        if expired&.provider_invitation_id.present? && !demo_bypass
          begin
            remote = client.get_invitation(invitation_id: expired.provider_invitation_id)
            remote_status = remote["status"].to_s.downcase
            if remote_status.in?(%w[pending])
              expired.update!(
                status: :invited,
                normalized_status: "invitation_sent",
                invitation_url: remote["invitation_url"].presence || expired.invitation_url,
                provider_status: remote_status
              )
              return render json: {
                background_check: serialize_background_check_for_technician(expired.reload),
                invitation_url: expired.invitation_url,
                payment_required: false,
                reused_existing_invitation: true
              }, status: :ok
            end
            if remote["report_id"].present?
              return render json: {
                error: "Checkr already created a report for the prior invitation. A new order was not created.",
                code: "report_already_exists",
                payment_required: false
              }, status: :unprocessable_entity
            end
            # expired/canceled at Checkr → fall through to create a new invitation
          rescue CheckrClient::Error => e
            return render json: {
              error: "Could not verify the prior invitation with Checkr before resending (#{e.message}).",
              code: "invitation_reconcile_failed"
            }, status: :unprocessable_entity
          end
        end

        # Historical Stripe-paid checks awaiting invitation must not spawn a second order.
        # Pending (unpaid) historical checkout rows do NOT block platform-paid screening.
        if BackgroundCheckFulfillmentService.awaiting_invitation.where(user_id: @current_user.id).exists?
          return render json: {
            error: "A previously paid background check invitation is still being prepared. Do not start another check.",
            code: "awaiting_invitation_fulfillment"
          }, status: :unprocessable_entity
        end

        unless demo_bypass
          package_error = validate_configured_package!(client, selected_package)
          return render json: { error: package_error, code: "checkr_package_invalid" }, status: :unprocessable_entity if package_error
          begin
            selected_node_custom_id = resolve_node_for_invitation!(client, selected_node_custom_id)
          rescue CheckrClient::Error => e
            return render json: { error: e.message, code: "checkr_node_required" }, status: :unprocessable_entity
          end
        end

        ack_notice = BackgroundCheckAcknowledgement.find_by(user_id: @current_user.id, acknowledgement_type: BackgroundCheckAcknowledgement::PLATFORM_NOTICE)
        ack_process = BackgroundCheckAcknowledgement.find_by(user_id: @current_user.id, acknowledgement_type: BackgroundCheckAcknowledgement::SCREENING_PROCESS)
        unless ack_notice&.accepted? && ack_process&.accepted?
          return render json: {
            error: "Accept the required TechFlash acknowledgements before starting a background check.",
            code: "acknowledgements_required"
          }, status: :unprocessable_entity
        end

        # Serialize starts per user to prevent duplicate billed Checkr invitations.
        background_check = nil
        User.transaction do
          User.lock.find(@current_user.id)
          if BackgroundCheck.where(user_id: @current_user.id)
              .where(status: BackgroundCheck.statuses.values_at("invited", "pending", "processing"))
              .exists?
            raise ActiveRecord::Rollback
          end

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
            # TechFlash absorbs Checkr report cost — technicians are never charged.
            payment_status: :waived,
            paid_by: "platform",
            disclosure_accepted_at: ack_notice.accepted_at,
            authorization_accepted_at: ack_process.accepted_at,
            consent_ip: request.remote_ip.to_s.presence
          )
        end

        if background_check.blank?
          raced = BackgroundCheck.where(user_id: @current_user.id)
            .where(status: BackgroundCheck.statuses.values_at("invited", "pending", "processing", "suspended", "not_started"))
            .order(created_at: :desc)
            .first
          if raced.present?
            return render json: {
              background_check: serialize_background_check_for_technician(raced),
              invitation_url: raced.invitation_url,
              payment_required: false,
              reused_existing_invitation: true
            }, status: :ok
          end
          return render json: { error: "Background check already in progress.", payment_required: false }, status: :unprocessable_entity
        end

        if demo_bypass
          invitation_url = demo_checkr_invitation_url
          background_check.update!(
            status: :invited,
            normalized_status: "invitation_sent",
            provider_status: "demo_invitation_sent",
            invitation_url: invitation_url,
            started_at: Time.current
          )
          profile.update!(background_status: :pending)
          return render json: {
            background_check: serialize_background_check_for_technician(background_check.reload),
            payment_required: false,
            invitation_url: invitation_url,
            background_check_options: build_background_check_options,
            demo_bypass: true
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
            background_check: serialize_background_check_for_technician(background_check.reload),
            payment_required: false,
            invitation_url: background_check.invitation_url || invitation["invitation_url"],
            background_check_options: background_check_options
          }, status: :ok
        rescue BackgroundCheckStartService::Error, CheckrClient::Error => e
          background_check.update!(status: :failed, admin_notes: e.message) if background_check.admin_notes.blank?
          render json: { error: e.message }, status: :unprocessable_entity
        end
      end

      def background_check_options
        options = build_background_check_options
        render json: options, status: :ok
      rescue CheckrClient::Error => e
        render json: {
          nodes_exist: false,
          selected_node_custom_id: nil,
          nodes: [],
          packages: [],
          packages_available: false,
          package_filter_fallback: false,
          package_selection_reason: "checkr_api_error",
          configured_package_name: nil,
          configured_node_custom_id: nil,
          ready_for_start: false,
          options_error: e.message,
          error: e.message
        }, status: :ok
      end

      # Disabled: technicians no longer pay for background checks. Historical Stripe
      # rows remain; this endpoint must not create new Checkout sessions.
      def create_background_check_checkout
        render json: {
          error: "Technician background-check payment is disabled. TechFlash covers Checkr report costs.",
          code: "technician_background_check_payment_disabled",
          payment_required: false
        }, status: :gone
      end

      def reset_demo_background_check
        unless DemoMode.enabled?
          return render json: { error: "Demo reset is only available in the demo environment." }, status: :forbidden
        end

        profile = VerificationProfile.for_user!(@current_user)
        checks_to_reset = BackgroundCheck.where(user_id: @current_user.id)
          .where(
            "status IN (?) OR payment_status = ?",
            BackgroundCheck.statuses.values_at("invited", "pending", "processing"),
            BackgroundCheck.payment_statuses["pending"]
          )

        checks_to_reset.each do |check|
          check.update!(
            status: :failed,
            normalized_status: "canceled",
            provider_status: "demo_reset",
            payment_status: :failed,
            admin_notes: "Reset by demo user via settings undo."
          )
        end

        profile.update!(background_status: :not_started)

        render json: {
          success: true,
          message: checks_to_reset.any? ? "Demo background check attempt reset." : "No in-progress background check to reset.",
          reset_count: checks_to_reset.size
        }, status: :ok
      end

      private

      def build_background_check_options
        if checkr_demo_bypass_enabled?
          configured_package_name = CheckrConfiguration.new.default_package.to_s.presence || "checkrdirect_essential_criminal"
          return {
            nodes_exist: false,
            selected_node_custom_id: nil,
            nodes: [],
            packages: [
              {
                id: "demo_package",
                slug: configured_package_name,
                name: configured_package_name.titleize,
                screenings: [],
                tier: "demo"
              }
            ],
            packages_available: true,
            package_filter_fallback: false,
            package_selection_reason: "demo_bypass",
            configured_package_name: configured_package_name,
            configured_node_custom_id: nil,
            ready_for_start: configured_package_name.present?,
            demo_bypass: true,
            technician_payment_required: false
          }
        end

        checkr_configuration = CheckrConfiguration.new
        unless checkr_configuration.requests_allowed?
          return {
            nodes_exist: false,
            selected_node_custom_id: nil,
            nodes: [],
            packages: [],
            packages_available: false,
            package_filter_fallback: false,
            package_selection_reason: "checkr_disabled",
            configured_package_name: checkr_configuration.default_package.to_s.presence,
            configured_node_custom_id: checkr_configuration.default_node_custom_id.to_s.presence,
            ready_for_start: false,
            options_error: checkr_configuration.requests_block_reason
          }
        end

        client = CheckrClient.new
        unless client.configured?
          return {
            nodes_exist: false,
            selected_node_custom_id: nil,
            nodes: [],
            packages: [],
            packages_available: false,
            package_filter_fallback: false,
            package_selection_reason: "checkr_not_configured",
            configured_package_name: checkr_configuration.default_package.to_s.presence,
            configured_node_custom_id: checkr_configuration.default_node_custom_id.to_s.presence,
            ready_for_start: false,
            options_error: "Checkr API credentials are not configured. Set CHECKR_SECRET_KEY or enable CHECKR_DEMO_BYPASS=true for testing."
          }
        end

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

      def resolve_background_check_context(fail_closed: false)
        job = nil
        job_application = nil
        if params[:job_application_id].present?
          job_application = JobApplication.find_by(id: params[:job_application_id], technician_profile_id: @current_user.technician_profile&.id)
          job = job_application&.job
        elsif params[:job_id].present?
          job = Job.find_by(id: params[:job_id])
          job_application = JobApplication.find_by(job_id: job&.id, technician_profile_id: @current_user.technician_profile&.id)
        end

        profile = @current_user.technician_profile
        country = job&.country.presence || profile&.country.presence
        state = job&.state.presence || profile&.state.presence
        city = job&.city.presence || profile&.city.presence

        if fail_closed
          if country.blank? || state.blank?
            return {
              job: job,
              job_application: job_application,
              work_location: nil,
              work_location_error: "Add country and state to your technician profile before starting a background check."
            }
          end
        else
          country ||= "US"
          state ||= "TX"
          city ||= "Houston"
        end

        {
          job: job,
          job_application: job_application,
          work_location: { country: country, state: state, city: city }.compact,
          work_location_error: nil
        }
      end

      def validate_configured_package!(client, selected_package)
        packages = client.list_packages
        return nil if package_available?(packages, selected_package)

        "Configured Checkr package '#{selected_package}' is not available on this account. " \
          "Update CHECKR_DEFAULT_PACKAGE to a valid package slug (owner decision: checkrdirect_essential_criminal)."
      rescue CheckrClient::Error => e
        "Unable to validate Checkr package: #{e.message}"
      end

      # Node is required only when the Checkr account has hierarchy nodes.
      # segmentation_enabled with zero nodes → omit node (official Checkr guidance).
      def resolve_node_for_invitation!(client, configured_node_custom_id)
        nodes = client.list_nodes
        return nil if nodes.blank?
        return configured_node_custom_id if configured_node_custom_id.present? && resolve_configured_node(nodes, configured_node_custom_id)

        raise CheckrClient::Error,
              "This Checkr account has hierarchy nodes but CHECKR_DEFAULT_NODE_CUSTOM_ID is missing or invalid."
      end

      def serialize_background_check_for_technician(check)
        return nil if check.blank?

        check.as_json.merge(
          "technician_status_label" => check.technician_visible_status_label,
          "report_url" => nil,
          "dashboard_url" => nil
        )
      end

      def checkr_demo_bypass_enabled?
        CheckrConfiguration.new.demo_bypass_enabled?
      end

      def demo_checkr_invitation_url
        "#{ENV.fetch('FRONTEND_URL', 'http://localhost:5173').to_s.chomp('/')}#{settings_profile_path(query: 'tab=verification&checkr_demo=invitation')}"
      end

      def settings_profile_path(query:)
        "#{demo_frontend_prefix}/settings?#{query}"
      end

      def demo_frontend_prefix
        return "/demo" if Rails.env.to_s == "demo" || ActiveModel::Type::Boolean.new.cast(ENV["DEMO_MODE"])

        ""
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
            report_url: nil,
            dashboard_url: nil,
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
