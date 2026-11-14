# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class CheckrInvitationConcurrencyTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "concurrent start requests create at most one platform-paid invitation row" do
        skip "PostgreSQL concurrency test" unless ActiveRecord::Base.connection.adapter_name.match?(/postgres/i)

        user = User.create!(
          email: "bg-conc-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician,
          first_name: "Conc",
          last_name: "Test"
        )
        TechnicianProfile.create!(
          user: user,
          trade_type: "HVAC",
          availability: "Full-time",
          membership_level: "basic",
          city: "Houston",
          state: "TX",
          country: "US",
          zip_code: "77002"
        )
        BackgroundCheckAcknowledgement::TYPES.each do |type|
          BackgroundCheckAcknowledgementService.upsert!(
            user: user,
            acknowledgement_type: type,
            accepted: true,
            actor_user: user
          )
        end

        previous_package = ENV["CHECKR_DEFAULT_PACKAGE"]
        ENV["CHECKR_DEFAULT_PACKAGE"] = "essential"
        headers = auth_header_for(user)
        create_count = 0
        mutex = Mutex.new

        fake_client = Object.new
        fake_client.define_singleton_method(:configured?) { true }
        fake_client.define_singleton_method(:default_package) { "essential" }
        fake_client.define_singleton_method(:default_node_custom_id) { nil }
        fake_client.define_singleton_method(:list_packages) { [{ "slug" => "essential" }] }
        fake_client.define_singleton_method(:list_nodes) { [] }

        original_client_new = CheckrClient.method(:new)
        CheckrClient.singleton_class.send(:define_method, :new) { fake_client }

        original_launch = BackgroundCheckStartService.method(:launch_checkr_invitation!)
        BackgroundCheckStartService.singleton_class.send(:define_method, :launch_checkr_invitation!) do |check|
          mutex.synchronize { create_count += 1 }
          check.update!(
            status: :invited,
            normalized_status: "invitation_sent",
            provider_invitation_id: "inv_conc_#{check.id}",
            invitation_url: "http://example.com/inv/#{check.id}",
            started_at: Time.current
          )
          { "id" => "inv_conc_#{check.id}", "invitation_url" => check.invitation_url }
        end

        threads = 5.times.map do
          Thread.new do
            post "/api/v1/verification/start_background_check", headers: headers, as: :json
          end
        end
        threads.each(&:join)

        assert_operator BackgroundCheck.where(user_id: user.id).count, :<=, 1
        assert_operator create_count, :<=, 1
      ensure
        if defined?(original_launch) && original_launch
          BackgroundCheckStartService.singleton_class.send(:define_method, :launch_checkr_invitation!, original_launch)
        end
        if defined?(original_client_new) && original_client_new
          CheckrClient.singleton_class.send(:define_method, :new, original_client_new)
        end
        if defined?(previous_package)
          if previous_package.nil?
            ENV.delete("CHECKR_DEFAULT_PACKAGE")
          else
            ENV["CHECKR_DEFAULT_PACKAGE"] = previous_package
          end
        end
      end
    end
  end
end
