# frozen_string_literal: true

require "digest"
require "test_helper"

class GhlDocumentFileAttacherTest < ActiveSupport::TestCase
  MINI_PNG = Base64.decode64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  ).b

  setup do
    user = User.create!(
      email: "ghl-license-attacher@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550299"
    )
    @profile = TechnicianProfile.create!(
      user: user,
      trade_type: "Electrician",
      availability: "Full-time",
      phone: "7135550299"
    )
    @document = @profile.documents.create!(
      doc_type: "certificate",
      status: :pending_review,
      issuer: "Texas Journeyman Electrician",
      document_number: "123456",
      metadata: { "source" => "ghl_intake" }
    )
  end

  test "attaches a downloadable license image" do
    GhlDocumentFileAttacher.attach!(@document, fetched(MINI_PNG, filename: "license.png"))

    blob = @document.reload.file.blob
    assert blob.present?
    assert blob.service.exist?(blob.key)
    assert_equal MINI_PNG, blob.service.download(blob.key)
    assert_equal "image/png", blob.content_type
    assert @document.pending_review?
  end

  test "failed attach leaves an existing license image intact" do
    GhlDocumentFileAttacher.attach!(@document, fetched(MINI_PNG, filename: "keep.png"))
    old_blob = @document.reload.file.blob

    ActiveStorage::Blob.stub(:create_and_upload!, ->(*) { raise ActiveStorage::IntegrityError }) do
      assert_raises(GhlDocumentFileAttacher::Error) do
        GhlDocumentFileAttacher.attach!(@document, fetched(MINI_PNG, filename: "fail.png"))
      end
    end

    @document.reload
    assert @document.file.attached?
    assert_equal old_blob.id, @document.file.blob.id
  end

  private

  def fetched(bytes, filename: "license.png")
    GhlRemoteImageFetcher::Result.new(
      io: StringIO.new(bytes),
      content_type: "image/png",
      filename: filename,
      bytesize: bytes.bytesize
    )
  end
end
