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
          package_name: CheckrClient.new.default_package,
          status: :not_started,
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
          render json: {
            background_check: background_check.reload,
            payment_required: false,
            invitation_url: invitation["invitation_url"]
          }, status: :ok
        rescue BackgroundCheckStartService::Error => e
          background_check.update!(status: :failed, admin_notes: e.message)
          render json: { error: e.message }, status: :unprocessable_entity
        end
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
            status: (background_check&.status || "not_started"),
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
