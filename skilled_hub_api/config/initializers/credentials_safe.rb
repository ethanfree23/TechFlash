# frozen_string_literal: true

# Staging must boot without production RAILS_MASTER_KEY / encrypted credentials.
# Prefer ENV for all staging secrets; never crash boot on missing master key.
module CredentialsSafe
  module_function

  def dig(*path)
    return nil if Rails.env.staging?

    Rails.application.credentials.dig(*path)
  rescue ActiveSupport::EncryptedFile::MissingKeyError, ArgumentError
    nil
  end
end
