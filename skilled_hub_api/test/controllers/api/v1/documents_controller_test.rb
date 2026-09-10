# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class DocumentsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      MINI_PNG = Base64.decode64(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
      ).b
      MINI_JPEG = "\xFF\xD8\xFF\xE0".b + "JFIF" + ("\x00".b * 12)
      MINI_GIF = "GIF89a\x01\x00\x01\x00\x00\x00\x00;".b
      MINI_WEBP = "RIFF".b + "\x08\x00\x00\x00".b + "WEBP".b + "xxxx".b
      MINI_HEIC = "\x00\x00\x00\x18ftypheic".b + ("\x00".b * 16)

      setup do
        @user = User.create!(
          email: "license-upload@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician,
          phone: "7135550401"
        )
        @profile = TechnicianProfile.create!(
          user: @user,
          trade_type: "Electrician",
          availability: "Full-time",
          phone: "7135550401"
        )
        @tmpfiles = []
      end

      teardown do
        @tmpfiles.each do |file|
          file.close!
        rescue StandardError
          nil
        end
      end

      test "jpeg png webp and gif license uploads return a file url and stay pending" do
        {
          "license.jpg" => [MINI_JPEG, "image/jpeg"],
          "license.png" => [MINI_PNG, "image/png"],
          "license.webp" => [MINI_WEBP, "image/webp"],
          "license.gif" => [MINI_GIF, "image/gif"]
        }.each_with_index do |(name, (bytes, mime)), index|
          post "/api/v1/documents",
               params: {
                 file: uploaded(bytes, name, mime),
                 uploadable_type: "TechnicianProfile",
                 uploadable_id: @profile.id,
                 doc_type: "certificate",
                 issuer: "License #{index}",
                 document_number: "N#{index}"
               },
               headers: auth_header_for(@user)

          assert_response :created, response.body
          body = JSON.parse(response.body)
          body = body["document"] if body["document"]
          assert body["file_url"].present?
          assert_equal "pending_review", body["status"]
          assert_equal "License #{index}", body["issuer"]
          assert_equal "N#{index}", body["document_number"]
          refute_equal "approved", body["status"]
        end

        get "/api/v1/documents", headers: auth_header_for(@user)
        assert_response :ok
        list = JSON.parse(response.body)
        list = list["documents"] if list.is_a?(Hash)
        assert_equal 4, list.length
        list.each do |doc|
          assert doc["file_url"].present?
          assert_includes doc["file_url"], "/rails/active_storage/"
        end
      end

      test "heic upload is rejected with a clear message" do
        post "/api/v1/documents",
             params: {
               file: uploaded(MINI_HEIC, "license.heic", "image/heic"),
               uploadable_type: "TechnicianProfile",
               uploadable_id: @profile.id,
               doc_type: "certificate",
               issuer: "Should not save"
             },
             headers: auth_header_for(@user)

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/HEIC\/HEIF/i, body["error"])
        assert_equal 0, @profile.documents.count
      end

      test "non-image file is rejected and existing license remains" do
        post "/api/v1/documents",
             params: {
               file: uploaded(MINI_PNG, "keep.png", "image/png"),
               uploadable_type: "TechnicianProfile",
               uploadable_id: @profile.id,
               doc_type: "certificate",
               issuer: "Keep me",
               document_number: "KEEP-1"
             },
             headers: auth_header_for(@user)
        assert_response :created
        existing_id = JSON.parse(response.body)["id"]

        post "/api/v1/documents",
             params: {
               file: uploaded("<html>nope</html>", "notes.txt", "text/plain"),
               uploadable_type: "TechnicianProfile",
               uploadable_id: @profile.id,
               doc_type: "certificate",
               issuer: "Should fail"
             },
             headers: auth_header_for(@user)

        assert_response :unprocessable_entity
        assert_match(/not a supported image type/i, JSON.parse(response.body)["error"])
        assert_equal 1, @profile.documents.count
        kept = @profile.documents.find(existing_id)
        assert_equal "Keep me", kept.issuer
        assert kept.file.attached?
      end

      test "index file urls still resolve after a second fetch" do
        post "/api/v1/documents",
             params: {
               file: uploaded(MINI_PNG, "refresh.png", "image/png"),
               uploadable_type: "TechnicianProfile",
               uploadable_id: @profile.id,
               doc_type: "certificate",
               issuer: "Refresh me"
             },
             headers: auth_header_for(@user)
        first = JSON.parse(response.body)["file_url"]

        get "/api/v1/documents", headers: auth_header_for(@user)
        list = JSON.parse(response.body)
        list = list["documents"] if list.is_a?(Hash)
        second = list.first["file_url"]
        assert_equal first.split("?").first, second.split("?").first
        assert second.include?("/rails/active_storage/")
      end

      private

      def uploaded(bytes, filename, mime)
        ext = File.extname(filename)
        file = Tempfile.new([File.basename(filename, ext), ext])
        file.binmode
        file.write(bytes)
        file.flush
        file.rewind
        @tmpfiles << file
        Rack::Test::UploadedFile.new(file.path, mime)
      end
    end
  end
end
