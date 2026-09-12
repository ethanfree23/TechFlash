# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersSmsAndVerificationTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(
            email: "admin-sms@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0500"
          )
          @tech = User.create!(
            email: "tech-sms@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            first_name: "John",
            last_name: "Smith",
            phone: "7135552222"
          )
          TechnicianProfile.create!(user: @tech, trade_type: "HVAC Technician", availability: "Full-time", phone: "7135552222")
        end

        test "index includes verification inventory without N+1 document queries per user" do
          second = User.create!(
            email: "tech-sms-2@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            first_name: "Ada",
            last_name: "Lee",
            phone: "7135553333"
          )
          TechnicianProfile.create!(user: second, trade_type: "Plumber", availability: "Full-time", phone: "7135553333", has_trade_credential: false)

          get "/api/v1/admin/users", headers: auth_header_for(@admin)
          assert_response :ok
          rows = JSON.parse(response.body)["users"].index_by { |r| r["id"] }
          john = rows[@tech.id]
          ada = rows[second.id]
          assert_equal "unknown", john["verification"]["trade_license"]["state"]
          assert_equal "na", ada["verification"]["trade_license"]["state"]
          assert_equal 0, john["verification"]["professional_references"]["count"]
          assert_equal "Incomplete", john["verification"]["background_check"]["label"]
          assert john["verification"].key?("suggested_sms")
        end

        test "send sms requires admin" do
          post "/api/v1/admin/users/#{@tech.id}/sms",
               params: { message: "Hello" },
               as: :json,
               headers: auth_header_for(@tech)
          assert_response :forbidden
        end

        test "empty message is rejected" do
          post "/api/v1/admin/users/#{@tech.id}/sms",
               params: { message: "  " },
               as: :json,
               headers: auth_header_for(@admin)
          assert_response :unprocessable_entity
          body = JSON.parse(response.body)
          assert_equal false, body["success"]
        end

        test "oversized message is rejected" do
          post "/api/v1/admin/users/#{@tech.id}/sms",
               params: { message: "x" * 1601, context: "admin_verification" },
               as: :json,
               headers: auth_header_for(@admin)
          assert_response :unprocessable_entity
        end

        test "admin sms send uses Ghl::SmsSender" do
          fake = Struct.new(:ok, :status, :error, :destination, :provider_message_id, :conversation_id, :http_status, :log_id, keyword_init: true) do
            def as_json(_ = nil)
              { success: true, status: "sent", provider_message_id: provider_message_id }
            end
          end.new(ok: true, status: :sent, http_status: :ok, provider_message_id: "msg-admin")

          Ghl::SmsSender.stub(:call, fake) do
            post "/api/v1/admin/users/#{@tech.id}/sms",
                 params: { message: "Please upload your license photo.", context: "admin_verification" },
                 as: :json,
                 headers: auth_header_for(@admin)
          end

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal true, body["success"]
          assert_equal "sent", body["status"]
        end
      end
    end
  end
end
