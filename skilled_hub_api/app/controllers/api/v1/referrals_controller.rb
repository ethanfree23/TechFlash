module Api
  module V1
    class ReferralsController < ApplicationController
      before_action :authenticate_user

      def create
        referral = ReferralSubmission.new(referral_params)
        referral.referrer_user = @current_user
        referral.crm_lead = build_crm_lead(referral)
        referral.referred_user = find_existing_user(referral.email)

        if referral.save
          create_admin_referral_message!(referral)
          render json: { id: referral.id, message: "Referral submitted. Thank you." }, status: :created
        else
          render json: { errors: referral.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def referral_params
        params.permit(:first_name, :last_name, :cell_phone, :referred_type, :email, :location, :extra_info)
      end

      def build_crm_lead(referral)
        full_name = "#{referral.first_name} #{referral.last_name}".strip
        source = "Referral from #{@current_user.email} at #{Time.current.iso8601}"
        notes = [source, referral.location.presence && "Location: #{referral.location}", referral.extra_info.presence].compact.join("\n")

        CrmLead.create!(
          name: full_name.presence || referral.email,
          contact_name: full_name.presence,
          email: referral.email,
          phone: referral.cell_phone,
          status: "lead",
          notes: "[Referral]\n#{notes}"
        )
      end

      def create_admin_referral_message!(referral)
        body_lines = [
          "REFERRAL",
          "Type: #{referral.referred_type}",
          "Name: #{referral.first_name} #{referral.last_name}",
          "Email: #{referral.email}",
          ("Phone: #{referral.cell_phone}" if referral.cell_phone.present?),
          ("Location: #{referral.location}" if referral.location.present?),
          ("Extra info: #{referral.extra_info}" if referral.extra_info.present?),
          "Submitted by: #{@current_user.email} (user ##{@current_user.id})"
        ].compact

        submission = @current_user.feedback_submissions.create!(
          kind: "referral",
          page_path: "/referrals",
          body: body_lines.join("\n")
        )
        FeedbackInboxThread.create_for!(submission)
      rescue StandardError => e
        Rails.logger.error("Referral feedback thread: #{e.class} #{e.message}")
      end

      def find_existing_user(email)
        User.find_by("LOWER(email) = ?", email.to_s.downcase.strip)
      end
    end
  end
end
