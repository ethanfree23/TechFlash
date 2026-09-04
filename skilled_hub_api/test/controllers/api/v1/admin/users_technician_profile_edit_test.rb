# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersTechnicianProfileEditTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(
            email: "admin-tech-profile-edit@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-7000"
          )
          @technician = User.create!(
            email: "alejandro.tapia@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            first_name: "Alejandro",
            last_name: "Tapia",
            phone: "713-555-7001"
          )
          @profile = TechnicianProfile.new(
            user: @technician,
            trade_type: "General Laborer / Helper",
            phone: "713-555-7001",
            availability: "Full-time",
            zip_code: "77002",
            city: "Houston",
            state: "Texas",
            country: "United States",
            latitude: 29.7604,
            longitude: -95.3698
          )
          @profile.client_coordinates_provided = true
          @profile.save!
          @tmpfiles = []
        end

        teardown do
          @tmpfiles.each do |file|
            file.close!
          rescue StandardError
            nil
          end
        end

        test "technician cannot edit another technician via admin profile endpoint" do
          other = User.create!(
            email: "other-tech-profile-edit@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            phone: "713-555-7002"
          )
          TechnicianProfile.create!(user: other, trade_type: "Plumber", phone: "713-555-7002")

          patch "/api/v1/admin/users/#{@technician.id}/profile",
                params: { first_name: "Hacked" },
                headers: auth_header_for(other),
                as: :json

          assert_response :forbidden
          assert_equal "Alejandro", @technician.reload.first_name
        end

        test "admin can update technician onboarding fields rate radius and references" do
          GeocodingService.stub(:geocode, [29.7604, -95.3698]) do
            patch "/api/v1/admin/users/#{@technician.id}/profile",
                  params: {
                    first_name: "Alex",
                    last_name: "Tapia-Lopez",
                    email: "alex.tapia@example.com",
                    account_phone: "713-555-7111",
                    phone: "713-555-7111",
                    zip_code: "77002",
                    trade_type: "HVAC Technician",
                    skill_class: "Journeyman",
                    experience_years: 8,
                    min_hourly_rate_cents: 4500,
                    max_distance_miles: 35,
                    license_document_number: "TX-HVAC-9988",
                    license_issuer: "Texas HVAC license",
                    references: [
                      {
                        full_name: "Jordan Smith",
                        email: "jordan.smith@example.com",
                        phone: "555-111-2233",
                        company_name: "Smith Mechanical"
                      },
                      {
                        full_name: "Pat Manager",
                        email: "pat.manager@example.com",
                        phone: "555-222-3344",
                        company_name: "North Service"
                      },
                      {
                        full_name: "Casey Lead",
                        email: "casey.lead@example.com",
                        phone: "555-333-4455",
                        company_name: "West Service"
                      }
                    ]
                  },
                  headers: auth_header_for(@admin),
                  as: :json
          end

          assert_response :ok, response.body
          body = JSON.parse(response.body)
          assert_equal "Profile updated", body["message"]

          @technician.reload
          @profile.reload
          assert_equal "Alex", @technician.first_name
          assert_equal "Tapia-Lopez", @technician.last_name
          assert_equal "alex.tapia@example.com", @technician.email
          assert_equal "713-555-7111", @technician.phone
          assert_equal "713-555-7111", @profile.phone
          assert_equal "77002", @profile.zip_code
          assert_equal "HVAC Technician", @profile.trade_type
          assert_equal "journeyman", @profile.skill_class
          assert_equal 8, @profile.experience_years

          pref = @technician.job_alert_preference
          assert_not_nil pref
          assert_equal 4500, pref.min_hourly_rate_cents
          assert_equal 35, pref.max_distance_miles

          refs = @technician.verification_references_as_technician.order(:created_at)
          assert_equal 3, refs.size
          assert_equal ["Jordan Smith", "Pat Manager", "Casey Lead"], refs.map(&:full_name)
          assert_equal "Smith Mechanical", refs.first.company_name
          assert_equal "Professional reference", refs.first.relationship

          license = @profile.documents.where(doc_type: %w[license certificate cert]).first
          assert_not_nil license
          assert_equal "TX-HVAC-9988", license.document_number
          assert_equal "Texas HVAC license", license.issuer

          profile_json = body.dig("user", "profile")
          assert_equal "journeyman", profile_json["skill_class"]
          assert_equal "77002", profile_json["zip_code"]
          assert_equal 4500, profile_json["min_hourly_rate_cents"]
          assert_equal 35, profile_json["max_distance_miles"]
          assert_equal 3, profile_json["references"].size
          assert_equal "TX-HVAC-9988", profile_json["trade_licenses"].first["document_number"]
        end

        test "admin profile save does not wipe omitted fields" do
          @technician.update!(first_name: "Keep", last_name: "Name")
          @profile.update!(trade_type: "Electrician", experience_years: 4)

          patch "/api/v1/admin/users/#{@technician.id}/profile",
                params: { skill_class: "master" },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :ok, response.body
          @technician.reload
          @profile.reload
          assert_equal "Keep", @technician.first_name
          assert_equal "Name", @technician.last_name
          assert_equal "Electrician", @profile.trade_type
          assert_equal 4, @profile.experience_years
          assert_equal "77002", @profile.zip_code
          assert_equal "master", @profile.skill_class
        end

        test "admin can replace avatar and trade license file" do
          existing = @profile.documents.create!(
            doc_type: "certificate",
            document_number: "OLD-1",
            issuer: "Old issuer"
          )

          GeocodingService.stub(:geocode, [29.76, -95.36]) do
            patch "/api/v1/admin/users/#{@technician.id}/profile",
                  params: {
                    license_document_number: "NEW-42",
                    license_issuer: "State board",
                    avatar: png_upload("avatar"),
                    license_file: png_upload("license")
                  },
                  headers: auth_header_for(@admin)
          end

          assert_response :ok, response.body
          @profile.reload
          assert @profile.avatar.attached?
          existing.reload
          assert_equal "NEW-42", existing.document_number
          assert_equal "State board", existing.issuer
          assert existing.file.attached?
        end

        test "admin can edit and remove verification references without creating a second system" do
          keep = @technician.verification_references_as_technician.create!(
            full_name: "Keep Me",
            email: "keep@example.com",
            phone: "5551110001",
            company_name: "Keep Co",
            relationship: "Supervisor",
            status: :requested,
            requested_at: Time.current
          )
          drop = @technician.verification_references_as_technician.create!(
            full_name: "Drop Me",
            email: "drop@example.com",
            phone: "5551110002",
            company_name: "Drop Co",
            relationship: "Manager",
            status: :requested,
            requested_at: Time.current
          )

          patch "/api/v1/admin/users/#{@technician.id}/profile",
                params: {
                  references: [
                    {
                      id: keep.id,
                      full_name: "Keep Me Updated",
                      email: "keep@example.com",
                      phone: "5551110001",
                      company_name: "Keep Co LLC"
                    }
                  ]
                },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :ok, response.body
          assert_not VerificationReference.exists?(drop.id)
          keep.reload
          assert_equal "Keep Me Updated", keep.full_name
          assert_equal "Keep Co LLC", keep.company_name
          assert_equal 1, @technician.verification_references_as_technician.count
        end

        test "admin cannot create more than three references" do
          patch "/api/v1/admin/users/#{@technician.id}/profile",
                params: {
                  references: [
                    { full_name: "One", email: "one@example.com", phone: "5550000001" },
                    { full_name: "Two", email: "two@example.com", phone: "5550000002" },
                    { full_name: "Three", email: "three@example.com", phone: "5550000003" },
                    { full_name: "Four", email: "four@example.com", phone: "5550000004" }
                  ]
                },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :unprocessable_entity
          assert_includes JSON.parse(response.body)["errors"].join(" "), "at most 3"
          assert_equal 0, @technician.verification_references_as_technician.count
        end

        test "admin email update rejects duplicates" do
          User.create!(
            email: "taken-tech-email@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            phone: "713-555-7099"
          )

          patch "/api/v1/admin/users/#{@technician.id}/profile",
                params: { email: "taken-tech-email@example.com" },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :unprocessable_entity
          assert_equal "alejandro.tapia@example.com", @technician.reload.email
        end

        test "duplicate reference email returns validation errors" do
          patch "/api/v1/admin/users/#{@technician.id}/profile",
                params: {
                  references: [
                    { full_name: "One", email: "same@example.com", phone: "5550000011" },
                    { full_name: "Two", email: "same@example.com", phone: "5550000012" }
                  ]
                },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :unprocessable_entity
          errors = JSON.parse(response.body)["errors"].join(" ")
          assert_match(/email/i, errors)
        end

        private

        def png_upload(name)
          file = Tempfile.new([name, ".png"])
          file.binmode
          file.write("\x89PNG\r\n\x1a\n")
          file.write("\x00" * 32)
          file.flush
          file.rewind
          @tmpfiles << file
          Rack::Test::UploadedFile.new(file.path, "image/png")
        end
      end
    end
  end
end
