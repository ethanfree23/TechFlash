# frozen_string_literal: true

module Api
  module V1
    module Admin
      class MailtrapAuditsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        def show
          catalog = MailAuditCatalog.as_json
          render json: {
            mail_delivery: MailDelivery.audit_status,
            live_automations: catalog[:live_automations],
            manual_emails: catalog[:manual_emails],
            inactive_automations: catalog[:inactive_automations]
          }, status: :ok
        end
      end
    end
  end
end
