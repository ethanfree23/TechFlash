# frozen_string_literal: true

module Api
  module V1
    class MarketingLeadsController < ApplicationController
      def create
        email = params[:email].to_s.strip.downcase
        honeypot = params[:honeypot].to_s

        lead = MarketingLead.find_or_initialize_by(email: email)
        lead.role_view = params[:role_view]
        lead.source = params[:source]

        if honeypot.present?
          lead.honeypot_triggered = true
          lead.blocked_at ||= Time.current
        end

        if lead.save
          render json: {
            id: lead.id,
            email: lead.email,
            blocked: lead.honeypot_triggered
          }, status: :created
        else
          render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
        end
      end
    end
  end
end
