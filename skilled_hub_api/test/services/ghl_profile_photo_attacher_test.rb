# frozen_string_literal: true

require "digest"
require "test_helper"

class GhlProfilePhotoAttacherTest < ActiveSupport::TestCase
  MINI_PNG = Base64.decode64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  ).b

  SECOND_PNG = Base64.decode64(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz8DAwMAAAE4DAQf+n1IAAAAASUVORK5CYII="
  ).b

  setup do
    @user = User.create!(
      email: "ghl-photo-attacher@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550199"
    )
    @profile = TechnicianProfile.create!(
      user: @user,
      trade_type: "HVAC",
      availability: "Full-time",
      phone: "7135550199"
    )
  end

  test "uploaded avatar physically exists and downloads the original bytes" do
    GhlProfilePhotoAttacher.attach!(@profile, fetched(MINI_PNG, filename: "one.png"))

    blob = @profile.reload.avatar.blob
    assert blob.present?
    assert blob.service.exist?(blob.key)
    downloaded = blob.service.download(blob.key)
    assert_equal MINI_PNG.bytesize, downloaded.bytesize
    assert_equal MINI_PNG, downloaded
    assert_equal blob.checksum, Digest::MD5.base64digest(downloaded)
    assert File.exist?(blob.service.path_for(blob.key))
  end

  test "replacement avatar is downloadable and is the only avatar attachment" do
    GhlProfilePhotoAttacher.attach!(@profile, fetched(MINI_PNG, filename: "first.png"))
    first_blob_id = @profile.reload.avatar.blob.id

    GhlProfilePhotoAttacher.attach!(@profile, fetched(SECOND_PNG, filename: "second.png"))
    @profile.reload
    second_blob = @profile.avatar.blob

    refute_equal first_blob_id, second_blob.id
    assert_equal "second.png", second_blob.filename.to_s
    assert second_blob.service.exist?(second_blob.key)
    assert_equal SECOND_PNG, second_blob.service.download(second_blob.key)
    assert_equal 1, ActiveStorage::Attachment.where(record: @profile, name: "avatar").count
  end

  test "old avatar remains when the new upload fails" do
    GhlProfilePhotoAttacher.attach!(@profile, fetched(MINI_PNG, filename: "keep.png"))
    old_blob = @profile.reload.avatar.blob

    ActiveStorage::Blob.stub(:create_and_upload!, ->(*) { raise ActiveStorage::IntegrityError }) do
      error = assert_raises(GhlProfilePhotoAttacher::Error) do
        GhlProfilePhotoAttacher.attach!(@profile, fetched(SECOND_PNG, filename: "fail.png"))
      end
      assert_match(/could not be stored/i, error.message)
    end

    @profile.reload
    assert @profile.avatar.attached?
    assert_equal old_blob.id, @profile.avatar.blob.id
    assert old_blob.service.exist?(old_blob.key)
    assert_equal MINI_PNG, old_blob.service.download(old_blob.key)
  end

  test "physical persistence failure does not attach and leaves no orphan rows" do
    blob_count = ActiveStorage::Blob.count
    attachment_count = ActiveStorage::Attachment.count
    service = ActiveStorage::Blob.service

    fake_blob = ActiveStorage::Blob.new(
      key: "tfdiag#{SecureRandom.hex(12)}",
      filename: "missing.png",
      content_type: "image/png",
      byte_size: MINI_PNG.bytesize,
      checksum: Digest::MD5.base64digest(MINI_PNG),
      service_name: ActiveStorage::Blob.service.name
    )

    ActiveStorage::Blob.stub(:create_and_upload!, ->(*) { fake_blob }) do
      error = assert_raises(GhlProfilePhotoAttacher::Error) do
        GhlProfilePhotoAttacher.attach!(@profile, fetched(MINI_PNG))
      end
      assert_match(/not persisted/i, error.message)
    end

    refute @profile.reload.avatar.attached?
    assert_equal blob_count, ActiveStorage::Blob.count
    assert_equal attachment_count, ActiveStorage::Attachment.count
    refute service.exist?(fake_blob.key)
  end

  test "failed attach after upload cleans up the new blob" do
    blob_count = ActiveStorage::Blob.count
    attachment_count = ActiveStorage::Attachment.count
    profile = @profile
    profile.define_singleton_method(:save) do |*|
      raise ActiveRecord::RecordInvalid.new(profile)
    end
    profile.define_singleton_method(:save!) do |*|
      raise ActiveRecord::RecordInvalid.new(profile)
    end

    assert_raises(GhlProfilePhotoAttacher::Error) do
      GhlProfilePhotoAttacher.attach!(profile, fetched(MINI_PNG))
    end

    refute profile.reload.avatar.attached?
    assert_equal blob_count, ActiveStorage::Blob.count
    assert_equal attachment_count, ActiveStorage::Attachment.count
  end

  test "idempotent retry still attaches a downloadable avatar" do
    2.times do
      GhlProfilePhotoAttacher.attach!(@profile, fetched(MINI_PNG, filename: "retry.png"))
    end

    @profile.reload
    assert @profile.avatar.attached?
    assert_equal 1, ActiveStorage::Attachment.where(record: @profile, name: "avatar").count
    blob = @profile.avatar.blob
    assert blob.service.exist?(blob.key)
    assert_equal MINI_PNG, blob.service.download(blob.key)
  end

  private

  def fetched(bytes, filename: "photo.png")
    GhlRemoteImageFetcher::Result.new(
      io: StringIO.new(bytes),
      content_type: "image/png",
      filename: filename,
      bytesize: bytes.bytesize
    )
  end
end
