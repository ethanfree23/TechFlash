# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersAdminStarTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(
            email: "admin-star@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0100"
          )
          @tech = User.create!(
            email: "tech-star@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            first_name: "Focus",
            last_name: "Tech"
          )
          TechnicianProfile.create!(user: @tech, trade_type: "HVAC", availability: "Full-time")
          @company = User.create!(
            email: "company-star@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            phone: "713-555-0101"
          )
          CompanyProfile.create!(user: @company, company_name: "Star Co", phone: "555-100-2000", bio: "Test")
        end

        test "index includes admin_starred for technicians" do
          @tech.update!(admin_starred: true)

          get "/api/v1/admin/users", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          tech_row = body["users"].find { |u| u["id"] == @tech.id }
          company_row = body["users"].find { |u| u["id"] == @company.id }

          assert_equal true, tech_row["admin_starred"]
          assert_equal false, company_row["admin_starred"]
        end

        test "admin can star and unstar a technician" do
          patch "/api/v1/admin/users/#{@tech.id}/admin_star",
                params: { admin_starred: true },
                headers: auth_header_for(@admin),
                as: :json
          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal true, body["user"]["admin_starred"]
          assert @tech.reload.admin_starred?

          patch "/api/v1/admin/users/#{@tech.id}/admin_star",
                params: { admin_starred: false },
                headers: auth_header_for(@admin),
                as: :json
          assert_response :ok
          assert_equal false, JSON.parse(response.body)["user"]["admin_starred"]
          assert_not @tech.reload.admin_starred?
        end

        test "admin_star toggles when admin_starred param omitted" do
          assert_not @tech.admin_starred?

          patch "/api/v1/admin/users/#{@tech.id}/admin_star",
                headers: auth_header_for(@admin),
                as: :json
          assert_response :ok
          assert @tech.reload.admin_starred?
        end

        test "cannot star a company account" do
          patch "/api/v1/admin/users/#{@company.id}/admin_star",
                params: { admin_starred: true },
                headers: auth_header_for(@admin),
                as: :json
          assert_response :unprocessable_entity
          assert_not @company.reload.admin_starred?
        end

        test "show includes admin_starred" do
          @tech.update!(admin_starred: true)
          get "/api/v1/admin/users/#{@tech.id}", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal true, body["user"]["admin_starred"]
        end

        test "non-admin cannot star technicians" do
          patch "/api/v1/admin/users/#{@tech.id}/admin_star",
                params: { admin_starred: true },
                headers: auth_header_for(@tech),
                as: :json
          assert_response :forbidden
        end
      end
    end
  end
end
