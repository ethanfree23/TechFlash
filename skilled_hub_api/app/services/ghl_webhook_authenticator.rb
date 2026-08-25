# frozen_string_literal: true

class GhlWebhookAuthenticator
  def self.authorized?(request)
    secret = GhlConfiguration.webhook_secret
    return false if secret.blank?

    token = bearer_token(request)
    return false if token.blank?

    expected = Digest::SHA256.digest(secret)
    actual = Digest::SHA256.digest(token)
    ActiveSupport::SecurityUtils.fixed_length_secure_compare(expected, actual)
  end

  def self.bearer_token(request)
    header = request.headers["Authorization"].to_s
    header[/\ABearer\s+(\S+)\z/i, 1]
  end
end
