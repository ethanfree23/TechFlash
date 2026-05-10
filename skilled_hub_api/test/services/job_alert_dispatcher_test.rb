# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class JobAlertDispatcherTest < ActiveSupport::TestCase
  setup do
    Rails.cache.clear

    admin = User.create!(
      email: "dispatcher-qa-admin@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin
    )
    @fixtures = EmailQaFixtureFactory.new(admin_user: admin).build
  end

  teardown do
    Rails.cache.clear
  end

  test "dispatch_for_job passes technician profile to job alert mailer" do
    user = @fixtures[:technician_user]
    tech = @fixtures[:technician_profile]
    job = @fixtures[:job]

    user.update!(
      email_notifications_enabled: true,
      job_alert_notifications_enabled: true
    )
    tech.update!(latitude: 30.2672, longitude: -97.7431)
    job.update!(latitude: 30.3000, longitude: -97.7000, hourly_rate_cents: 3_500, days: 2)

    user.job_alert_preference&.destroy!
    user.create_job_alert_preference!(
      trade_label: nil,
      min_hourly_rate_cents: 0,
      max_distance_miles: 200,
      min_duration_weeks: nil,
      max_duration_weeks: nil,
      email_enabled: true,
      sms_enabled: false,
      app_enabled: false
    )

    delivery_message = Minitest::Mock.new
    delivery_message.expect(:deliver_now, true)

    mailer_called = false
    mailer_lambda = lambda do |passed_user, passed_job, technician_profile:|
      mailer_called = true
      assert_equal user, passed_user
      assert_equal job, passed_job
      assert_equal tech, technician_profile
      delivery_message
    end

    UserMailer.stub(:job_alert_email, mailer_lambda) do
      MailDelivery.stub(:safe_deliver_result, ->(&block) { block.call; { success: true } }) do
        JobAlertDispatcher.dispatch_for_job(job)
      end
    end

    assert mailer_called, "expected UserMailer.job_alert_email to be called"
    delivery_message.verify
  end
end
