# frozen_string_literal: true

require "test_helper"

class MailtrapHttpDeliveryTest < ActiveSupport::TestCase
  test "build_payload includes recipient metadata and headers" do
    mail = Mail.new
    mail.from = "from@example.com"
    mail.to = "to@example.com"
    mail.cc = "cc@example.com"
    mail.bcc = "bcc@example.com"
    mail.reply_to = "reply@example.com"
    mail.subject = "Payload test"
    mail.text_part = Mail::Part.new do
      content_type "text/plain; charset=UTF-8"
      body "Hello text"
    end
    mail.html_part = Mail::Part.new do
      content_type "text/html; charset=UTF-8"
      body "<p>Hello html</p>"
    end
    mail["List-Unsubscribe"] = "<https://techflash.app/settings?tab=notifications>, <mailto:support@techflash.app?subject=Unsubscribe>"
    mail["Precedence"] = "list"
    mail["X-Auto-Response-Suppress"] = "All"

    payload = MailtrapHttpDelivery.new(api_token: "token").send(:build_payload, mail)

    assert_equal([{ email: "cc@example.com" }], payload[:cc])
    assert_equal([{ email: "bcc@example.com" }], payload[:bcc])
    assert_equal([{ email: "reply@example.com" }], payload[:reply_to])
    assert_equal "list", payload.dig(:headers, "Precedence")
    assert_equal "All", payload.dig(:headers, "X-Auto-Response-Suppress")
    assert_match(/settings\?tab=notifications/, payload.dig(:headers, "List-Unsubscribe"))
  end
end
