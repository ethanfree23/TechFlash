# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class ConversationsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @admin = User.create!(
          email: "admin+conv_inbox@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin,
          first_name: "Admin",
          last_name: "User"
        )
        @company_user = User.create!(
          email: "company+conv_inbox@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        CompanyProfile.create!(
          user: @company_user,
          company_name: "Inbox Test Co",
          industry: "Electrical",
          location: "Austin, TX",
          phone: "555-111-2222"
        )
        @submission = FeedbackSubmission.create!(
          user: @company_user,
          kind: "problem",
          body: "Payment status stuck",
          page_path: "/settings"
        )
        @conversation = FeedbackInboxThread.create_for!(@submission)
        @headers = auth_headers_for(@admin)
        @company_headers = auth_headers_for(@company_user)
      end

      test "admin can update inbox status and priority on feedback conversation" do
        patch "/api/v1/conversations/#{@conversation.id}",
              params: { inbox_status: "resolved", priority: "urgent" },
              headers: @headers,
              as: :json

        assert_response :success
        body = JSON.parse(response.body)
        assert_equal "resolved", body["inbox_status"]
        assert_equal "urgent", body["priority"]
        @conversation.reload
        assert_equal "resolved", @conversation.inbox_status
      end

      test "admin can assign and unassign feedback conversation" do
        patch "/api/v1/conversations/#{@conversation.id}",
              params: { assigned_to_id: @admin.id },
              headers: @headers,
              as: :json
        assert_response :success

        patch "/api/v1/conversations/#{@conversation.id}",
              params: { assigned_to_id: nil },
              headers: @headers,
              as: :json
        assert_response :success
        assert_nil @conversation.reload.assigned_to_id
      end

      test "mark_read clears is_unread" do
        assert_nil @conversation.admin_read_at

        patch "/api/v1/conversations/#{@conversation.id}",
              params: { mark_read: true },
              headers: @headers,
              as: :json

        assert_response :success
        body = JSON.parse(response.body)
        assert_equal false, body["is_unread"]
        assert @conversation.reload.admin_read_at.present?
      end

      test "non-admin cannot update feedback conversation inbox" do
        patch "/api/v1/conversations/#{@conversation.id}",
              params: { inbox_status: "archived" },
              headers: @company_headers,
              as: :json

        assert_response :forbidden
      end

      test "admin can post public and internal messages on feedback thread" do
        post "/api/v1/conversations/#{@conversation.id}/messages",
             params: { content: "We are looking into this.", internal: false },
             headers: @headers,
             as: :json
        assert_response :created

        post "/api/v1/conversations/#{@conversation.id}/messages",
             params: { content: "Internal: escalate to billing.", internal: true },
             headers: @headers,
             as: :json
        assert_response :created

        msgs = @conversation.messages.order(:id)
        assert_equal 3, msgs.count
        assert msgs.last.internal?
      end

      private

      def auth_headers_for(user)
        post "/api/v1/sessions", params: { email: user.email, password: "password123" }, as: :json
        token = JSON.parse(response.body).fetch("token")
        { "Authorization" => "Bearer #{token}" }
      end
    end
  end
end
