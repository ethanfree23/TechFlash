ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "jwt"

class ActiveSupport::TestCase
end

module AuthTestHelper
  def auth_header_for(user)
    token = JWT.encode({ user_id: user.id }, Rails.application.secret_key_base, "HS256")
    { "Authorization" => "Bearer #{token}" }
  end
end
