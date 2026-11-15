# frozen_string_literal: true

module TrustSafety
  # Short-lived, signed Active Storage URLs for admin document previews.
  #
  # The signed blob id embedded in the URL expires after +TTL+, so a leaked link is
  # useless shortly after it is issued. Only admins can request one (enforced by the
  # controller); the URL itself is never persisted or exposed on public endpoints.
  class DocumentFileAccess
    extend ActiveStorageUrlHelper

    TTL = 10.minutes
    IMAGE_TYPES = %w[image/jpeg image/png image/gif image/webp image/bmp].freeze

    def self.for(document)
      attachment = document.file
      return { available: false, reason: "No file was uploaded for this document." } unless blob_file_present?(attachment)

      blob = attachment.blob
      expires_at = TTL.from_now
      {
        available: true,
        url: signed_url(attachment, disposition: "inline"),
        download_url: signed_url(attachment, disposition: "attachment"),
        expires_at: expires_at.iso8601,
        expires_in_seconds: TTL.to_i,
        filename: blob.filename.to_s,
        content_type: blob.content_type,
        byte_size: blob.byte_size,
        kind: kind_for(blob.content_type)
      }
    rescue StandardError => e
      Rails.logger.warn("[TrustSafety::DocumentFileAccess] failed for document_id=#{document.id}: #{e.class}: #{e.message}")
      { available: false, reason: "The file could not be loaded from storage." }
    end

    def self.kind_for(content_type)
      type = content_type.to_s.downcase
      return "image" if IMAGE_TYPES.include?(type)
      return "pdf" if type == "application/pdf"

      "other"
    end

    def self.signed_url(attachment, disposition:)
      helpers = Rails.application.routes.url_helpers
      opts = AppHost.url_options
      if opts.blank?
        # Dev/test fallback: relative path; the frontend prefixes the active API origin.
        return helpers.rails_blob_path(attachment, only_path: true, disposition: disposition, expires_in: TTL)
      end

      helpers.rails_blob_url(attachment, disposition: disposition, expires_in: TTL, **opts)
    end
  end
end
