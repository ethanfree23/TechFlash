# frozen_string_literal: true

class CrmMailer < ApplicationMailer
  default from: ENV.fetch("MAILER_FROM", "noreply@techflash.example.com")

  def crm_follow_up(to:, subject:, body_html:, body_plain:, reply_to:, show_ctas: false, cc: [], bcc: [], signup_url: nil, post_job_url: nil, techflash_url: nil)
    @body_html = body_html
    @body_plain = body_plain
    @show_ctas = show_ctas
    @signup_url = signup_url
    @post_job_url = post_job_url
    @techflash_url = techflash_url

    mail(
      to: to,
      cc: cc.presence,
      bcc: bcc.presence,
      subject: subject,
      reply_to: reply_to
    )
  end
end
