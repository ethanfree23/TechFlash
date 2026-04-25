require "test_helper"

module Api
  module V1
    module Admin
      class CrmLeadsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "imports crm leads from rows payload" do
          admin = User.create!(
            email: "admin+crm_import_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )

          post "/api/v1/admin/crm_leads/import",
               params: {
                 rows: [
                   {
                     name: "Alpha Air",
                     contact_name: "Morgan Reed",
                     email: "morgan@alphaair.com",
                     phone: "555-100-2000",
                     website: "https://alphaair.com",
                     company_types: "hvac|electrical",
                     status: "lead",
                     notes: "Import test row"
                   },
                   {
                     name: "Broken Row Co",
                     status: "not-a-status"
                   }
                 ]
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal 1, body.fetch("imported_count")
          assert_equal 1, body.fetch("failed_count")
          assert_equal 1, body.fetch("errors").length
          created = CrmLead.find_by!(name: "Alpha Air")
          assert_equal %w[electrical hvac], created.company_types.sort
        end
      end
    end
  end
end
