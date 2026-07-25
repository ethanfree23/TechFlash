# frozen_string_literal: true

module ActiveStorageUrlHelper
  def absolute_blob_url(attachment)
    return nil unless attachment&.attached?

    opts = AppHost.url_options
    if opts.blank?
      # Local/dev fallback: emit a relative blob path when no public host is configured.
      # Frontend media URL resolver prefixes the active API origin for these paths.
      return Rails.application.routes.url_helpers.rails_blob_path(
        attachment,
        only_path: true,
        disposition: "inline"
      )
    end

    Rails.application.routes.url_helpers.rails_blob_url(
      attachment,
      disposition: "inline",
      **opts
    )
  rescue StandardError => e
    Rails.logger.warn("[ActiveStorageUrlHelper] blob url failed: #{e.class}: #{e.message}")
    nil
  end
end
