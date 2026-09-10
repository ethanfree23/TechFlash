# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class StorageDiagnosticsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(
            email: "admin-storage-diag@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          @company = User.create!(
            email: "company-storage-diag@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          CompanyProfile.create!(user: @company, company_name: "Diag Co")
        end

        test "rejects unauthenticated requests" do
          get "/api/v1/admin/storage_diagnostic"
          assert_response :unauthorized

          get "/api/v1/admin/storage_diagnostic/check"
          assert_response :unauthorized
        end

        test "rejects non admin" do
          get "/api/v1/admin/storage_diagnostic", headers: auth_header_for(@company)
          assert_response :forbidden

          get "/api/v1/admin/storage_diagnostic/check", headers: auth_header_for(@company)
          assert_response :forbidden
        end

        test "admin capture uploads through DiskService and check finds the key" do
          get "/api/v1/admin/storage_diagnostic", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)

          assert body["runtime"].is_a?(Hash)
          assert body["runtime"].key?("uid")
          assert body["runtime"].key?("gid")
          assert_equal Rails.root.to_s, body.dig("paths", "rails_root")
          assert body.dig("activestorage_test", "exist_after_upload")
          assert body.dig("activestorage_test", "checksum_match")
          assert_equal(
            body.dig("activestorage_test", "expected_byte_count"),
            body.dig("activestorage_test", "downloaded_byte_count")
          )
          refute_nil body.dig("activestorage_test", "key")
          refute ActiveStorage::Blob.exists?(key: body.dig("activestorage_test", "key"))

          get "/api/v1/admin/storage_diagnostic/check", headers: auth_header_for(@admin)
          assert_response :ok
          check = JSON.parse(response.body)
          assert check["state_found"]
          assert check.dig("activestorage_check", "exist")
          assert_equal body.dig("activestorage_test", "key"), check.dig("activestorage_check", "key")
        end
      end
    end
  end
end
