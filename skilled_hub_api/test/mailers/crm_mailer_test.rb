# frozen_string_literal: true

require "test_helper"

class CrmMailerTest < ActionMailer::TestCase
  test "crm_follow_up includes branded body and CTAs" do
    mail = CrmMailer.crm_follow_up(
      to: "prospect@example.com",
      subject: "Thanks for speaking",
      body_html: "<p>Hello Mike</p>",
      body_plain: "Hello Mike",
      reply_to: "admin@example.com",
      show_ctas: true,
      signup_url: "https://example.com/signup",
      post_job_url: "https://example.com/jobs/create",
      techflash_url: "https://example.com/for-companies"
    )

    html = mail.html_part.body.decoded
    assert_match(/Hello Mike/, html)
    assert_match(/Create your TechFlash account/, html)
    assert_match(/Post a job/, html)
    assert_match(/FE6711|techflash/i, html)
    assert_equal ["admin@example.com"], mail.reply_to
  end
end
