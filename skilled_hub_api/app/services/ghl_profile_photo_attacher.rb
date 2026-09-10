# frozen_string_literal: true

require "digest"
require "stringio"

class GhlProfilePhotoAttacher
  class Error < StandardError; end

  def self.attach!(profile, fetched)
    new(profile, fetched).attach!
  end

  def initialize(profile, fetched)
    @profile = profile
    @fetched = fetched
  end

  def attach!
    raise Error, "technician profile is missing" if @profile.blank?
    raise Error, "downloaded image is missing" if @fetched.blank? || @fetched.io.blank?

    bytes = read_bytes!(@fetched.io)
    raise Error, "downloaded image is missing" if bytes.blank?

    blob = nil
    io = StringIO.new(bytes)
    io.set_encoding(Encoding::BINARY)
    io.rewind

    blob = ActiveStorage::Blob.create_and_upload!(
      io: io,
      filename: @fetched.filename.presence || "ghl-profile-photo.jpg",
      content_type: @fetched.content_type.presence || "image/jpeg",
      identify: false
    )
    verify_persisted!(blob, expected_bytesize: bytes.bytesize)

    @profile.avatar.attach(blob)
    @profile.updated_at = Time.current
    @profile.save!
    verify_attached!(blob)
    @profile
  rescue Error
    cleanup_failed_blob(blob)
    raise
  rescue ActiveStorage::IntegrityError, ActiveStorage::FileNotFoundError
    cleanup_failed_blob(blob)
    raise Error, "profile photo could not be stored"
  rescue ActiveRecord::RecordInvalid => e
    cleanup_failed_blob(blob)
    raise Error, e.record.errors.full_messages.to_sentence.presence || e.message
  end

  private

  def read_bytes!(io)
    io.rewind if io.respond_to?(:rewind)
    data = io.read
    io.rewind if io.respond_to?(:rewind)
    data.to_s.b
  end

  def verify_persisted!(blob, expected_bytesize:)
    raise Error, "profile photo blob is missing" if blob.blank?
    raise Error, "profile photo file was not persisted" unless blob.service.exist?(blob.key)

    downloaded = blob.service.download(blob.key)
    if downloaded.bytesize != blob.byte_size || downloaded.bytesize != expected_bytesize
      raise Error, "profile photo size mismatch"
    end
    if blob.checksum.present? && Digest::MD5.base64digest(downloaded) != blob.checksum
      raise Error, "profile photo checksum mismatch"
    end
    if blob.service.respond_to?(:path_for)
      path = blob.service.path_for(blob.key)
      raise Error, "profile photo disk path is missing" unless File.exist?(path)
    end
  end

  def verify_attached!(blob)
    @profile.reload
    unless @profile.avatar.attached? && @profile.avatar.blob&.id == blob.id
      raise Error, "profile photo was not attached"
    end
    verify_persisted!(blob, expected_bytesize: blob.byte_size)
  end

  def cleanup_failed_blob(blob)
    return if blob.blank?

    key = blob.key
    service = blob.service
    blob.purge if blob.persisted?
    service.delete(key) if key.present? && service.exist?(key)
  rescue StandardError => e
    Rails.logger.error(
      "[GhlProfilePhotoAttacher] failed blob cleanup: #{e.class}: #{e.message}"
    )
  end
end
