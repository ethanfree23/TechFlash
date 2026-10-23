require "test_helper"

module Api
  module V1
    class MetaControllerTest < ActionDispatch::IntegrationTest
      test "meta exposes the deployed git revision from Railway build env" do
        env = {
          "RAILWAY_GIT_COMMIT_SHA" => "e894f774da23bcda27ed91426064b9bbcec0006c",
          "RAILWAY_GIT_BRANCH" => "main",
          "RAILWAY_DEPLOYMENT_ID" => "dep-123"
        }
        with_env(env) do
          get "/api/v1/meta"
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "TechFlash", body["app_name"]
        deploy = body.fetch("deploy")
        assert_equal "e894f774da23bcda27ed91426064b9bbcec0006c", deploy["git_sha"]
        assert_equal "e894f77", deploy["git_sha_short"]
        assert_equal "main", deploy["git_branch"]
        assert_equal "dep-123", deploy["deployment_id"]
        assert_not_nil Time.iso8601(deploy["booted_at"])
      end

      test "meta deploy fields are null when no build metadata is present" do
        with_env("RAILWAY_GIT_COMMIT_SHA" => nil, "GIT_SHA" => nil, "RAILWAY_GIT_BRANCH" => nil, "GIT_BRANCH" => nil) do
          get "/api/v1/meta"
        end

        assert_response :ok
        deploy = JSON.parse(response.body).fetch("deploy")
        assert_nil deploy["git_sha"]
        assert_nil deploy["git_sha_short"]
      end

      private

      def with_env(overrides)
        previous = overrides.keys.to_h { |k| [k, ENV[k]] }
        overrides.each { |k, v| v.nil? ? ENV.delete(k) : ENV[k] = v }
        yield
      ensure
        previous.each { |k, v| v.nil? ? ENV.delete(k) : ENV[k] = v }
      end
    end
  end
end
