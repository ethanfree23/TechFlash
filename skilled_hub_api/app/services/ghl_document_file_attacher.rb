# frozen_string_literal: true

require "digest"
require "stringio"

class GhlDocumentFileAttacher
  class Error < StandardError; end

  def self.attach!(document, fetched)
    new(document, fetched).attach!
  end

  def initialize(document, fetched)
    @document = document
    @fetched = fetched
  end

  def attach!
    raise Error, "document is missing" if @document.blank?
    raise Error, "downloaded image is missing" if @fetched.blank? || @fetched.io.blank?

    bytes = read_bytes!(@fetched.io)
    raise Error, "downloaded image is missing" if bytes.blank?

    blob = nil
    io = StringIO.new(bytes)
    io.set_encoding(Encoding::BINARY)
    io.rewind

    blob = ActiveStorage::Blob.create_and_upload!(
      io: io,
      filename: @fetched.filename.presence || "ghl-trade-license.jpg",
      content_type: @fetched.content_type.presence || "image/jpeg",
      identify: false
    )
    verify_persisted!(blob, expected_bytesize: bytes.bytesize)

    @document.file.attach(blob)
    @document.updated_at = Time.current
    @document.save!
    verify_attached!(blob)
    @document
  rescue Error
    cleanup_failed_blob(blob)
    raise
  rescue ActiveStorage::IntegrityError, ActiveStorage::FileNotFoundError
    cleanup_failed_blob(blob)
    raise Error, "license image could not be stored"
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
    raise Error, "license image blob is missing" if blob.blank?
    raise Error, "license image file was not persisted" unless blob.service.exist?(blob.key)

    downloaded = blob.service.download(blob.key)
    if downloaded.bytesize != blob.byte_size || downloaded.bytesize != expected_bytesize
      raise Error, "license image size mismatch"
    end
    if blob.checksum.present? && Digest::MD5.base64digest(downloaded) != blob.checksum
      raise Error, "license image checksum mismatch"
    end
    if blob.service.respond_to?(:path_for)
      path = blob.service.path_for(blob.key)
      raise Error, "license image disk path is missing" unless File.exist?(path)
    end
  end

  def verify_attached!(blob)
    @document.reload
    unless @document.file.attached? && @document.file.blob&.id == blob.id
      raise Error, "license image was not attached"
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
      "[GhlDocumentFileAttacher] failed blob cleanup: #{e.class}: #{e.message}"
    )
  end
end
