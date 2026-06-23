# frozen_string_literal: true

# Public hostname for Active Storage blob URLs (avatars, documents).
# Must be reachable from browsers — never use *.railway.internal here.
module AppHost
  INTERNAL_HOST_PATTERN = /\.railway\.internal\z/i

  module_function

  def normalized
    candidates = [
      ENV["APP_HOST"],
      ENV["RAILWAY_PUBLIC_DOMAIN"]
    ].filter_map { |raw| sanitize_host(raw) }

    host = candidates.find { |candidate| public_host?(candidate) }
    warn_if_misconfigured!(host)
    host
  end

  def url_options
    host = normalized
    return {} if host.blank?

    { host: host, protocol: "https" }
  end

  def sanitize_host(raw)
    value = raw.to_s.strip
    return nil if value.blank?

    value.sub(%r{\Ahttps?://}i, "").sub(%r{/\z}, "").split("/").first.presence
  end

  def public_host?(host)
    return false if host.blank?
    return false if host.match?(INTERNAL_HOST_PATTERN)
    return false if host == "localhost" || host.start_with?("127.0.0.1")

    true
  end

  def warn_if_misconfigured!(resolved_host)
    raw_app_host = sanitize_host(ENV["APP_HOST"])
    return if raw_app_host.blank?
    return if public_host?(raw_app_host)

    message =
      if raw_app_host.match?(INTERNAL_HOST_PATTERN)
        "[AppHost] APP_HOST=#{raw_app_host.inspect} is Railway-internal and not reachable from browsers. " \
          "Set APP_HOST to your public *.up.railway.app domain (or rely on RAILWAY_PUBLIC_DOMAIN)."
      else
        "[AppHost] APP_HOST=#{raw_app_host.inspect} is not usable for public blob URLs."
      end

    message += " Using #{resolved_host.inspect} instead." if resolved_host.present?
    Rails.logger&.warn(message)
  end
end
