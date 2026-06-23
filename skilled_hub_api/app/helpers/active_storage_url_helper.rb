# frozen_string_literal: true

module ActiveStorageUrlHelper
  def absolute_blob_url(attachment)
    return nil unless attachment&.attached?

    opts = AppHost.url_options
    return nil if opts.blank?

    Rails.application.routes.url_helpers.rails_blob_url(attachment, **opts)
  rescue StandardError => e
    Rails.logger.warn("[ActiveStorageUrlHelper] blob url failed: #{e.class}: #{e.message}")
    nil
  end
end
