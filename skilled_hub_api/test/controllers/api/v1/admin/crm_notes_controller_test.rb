require "test_helper"

module Api
  module V1
    module Admin
      class CrmNotesControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "creates and updates crm note and comment" do
          admin = User.create!(
            email: "admin+crm_notes_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          lead = CrmLead.create!(name: "Notes Test Co", status: "lead")

          post "/api/v1/admin/crm_leads/#{lead.id}/crm_notes",
               params: {
                 contact_method: "call",
                 title: "Initial outreach",
                 body: "Called front desk and left voicemail.",
                 made_contact: false
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          created_note_id = JSON.parse(response.body).dig("crm_note", "id")

          post "/api/v1/admin/crm_leads/#{lead.id}/crm_notes",
               params: {
                 parent_note_id: created_note_id,
                 contact_method: "email",
                 body: "Sent follow-up email afterwards.",
                 made_contact: true
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created

          patch "/api/v1/admin/crm_leads/#{lead.id}/crm_notes/#{created_note_id}",
                params: {
                  contact_method: "call",
                  title: "Initial outreach (updated)",
                  body: "Reached office manager by phone.",
                  made_contact: true
                },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "Initial outreach (updated)", body.dig("crm_note", "title")
          assert_equal true, body.dig("crm_note", "made_contact")
          assert_equal 1, body.fetch("crm_notes").length
          assert_equal 1, body.dig("crm_notes", 0, "comments").length
        end

        test "creates note with remind_at" do
          admin = User.create!(
            email: "admin+crm_notes_remind@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          lead = CrmLead.create!(name: "Remind Co", status: "lead")
          remind = 2.days.from_now.change(usec: 0)

          post "/api/v1/admin/crm_leads/#{lead.id}/crm_notes",
               params: {
                 contact_method: "note",
                 title: "Call back",
                 body: "Follow up on proposal.",
                 made_contact: false,
                 remind_at: remind.iso8601
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          body = JSON.parse(response.body)
          assert_equal remind.iso8601, body.dig("crm_note", "remind_at")
        end

        test "creates reminder note with empty body when remind_at is set" do
          admin = User.create!(
            email: "admin+crm_notes_remind_empty@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          lead = CrmLead.create!(name: "Remind Empty Co", status: "lead")
          remind = 3.days.from_now.change(usec: 0)

          post "/api/v1/admin/crm_leads/#{lead.id}/crm_notes",
               params: {
                 contact_method: "note",
                 title: "Ping",
                 body: "",
                 made_contact: false,
                 remind_at: remind.iso8601
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          body = JSON.parse(response.body)
          assert_nil body.dig("crm_note", "body").presence
          assert_equal remind.iso8601, body.dig("crm_note", "remind_at")
        end
      end
    end
  end
end
