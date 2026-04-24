# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class MasqueradesControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "admin receives masquerade jwt for company user" do
          admin = User.create!(
            email: "admin+masq_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          company_user = User.create!(
            email: "company+masq_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          profile = CompanyProfile.create!(
            user: company_user,
            company_name: "Masq Co",
            phone: "555-111-2222",
            bio: "Bio for masq"
          )
          company_user.update_column(:company_profile_id, profile.id)

          post "/api/v1/admin/masquerade",
               params: { target_user_id: company_user.id }.to_json,
               headers: auth_header_for(admin).merge("Content-Type" => "application/json")

          assert_response :created
          body = JSON.parse(response.body)
          assert body["token"].present?
          assert_equal company_user.id, body.dig("user", "id")
          assert_equal "company", body.dig("user", "role")

          payload = JWT.decode(body["token"], Rails.application.secret_key_base, true, { algorithm: "HS256" }).first
          assert_equal company_user.id, payload["user_id"]
          assert_equal true, payload["masquerade"]
          assert_equal admin.id, payload["impersonator_id"]
        end

        test "rejects masquerade as admin target" do
          admin = User.create!(
            email: "admin+masq2@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          other = User.create!(
            email: "admin+masq_target@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )

          post "/api/v1/admin/masquerade",
               params: { target_user_id: other.id }.to_json,
               headers: auth_header_for(admin).merge("Content-Type" => "application/json")

          assert_response :forbidden
        end

        test "non-admin cannot masquerade" do
          tech = User.create!(
            email: "tech+masq@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician
          )
          company_user = User.create!(
            email: "co+masq@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          cp = CompanyProfile.create!(user: company_user, company_name: "X", phone: "1", bio: "b")
          company_user.update_column(:company_profile_id, cp.id)

          post "/api/v1/admin/masquerade",
               params: { target_user_id: company_user.id }.to_json,
               headers: auth_header_for(tech).merge("Content-Type" => "application/json")

          assert_response :forbidden
        end
      end
    end
  end
end
