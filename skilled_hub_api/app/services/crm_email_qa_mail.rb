# frozen_string_literal: true

# Builds CRM follow-up mail for Email QA / Mailtrap testing (fixture data only).
class CrmEmailQaMail
  def self.build(admin_user:)
    base_url = ENV.fetch("FRONTEND_URL", "http://localhost:5173").to_s.chomp("/")
    sender_name = [admin_user.first_name, admin_user.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ")
    sender_name = "Ethan" if sender_name.blank?

    context = {
      "contact_first_name" => "Mike",
      "contact_name" => "Mike Rodriguez",
      "company_name" => "Rodriguez Electric",
      "sender_name" => sender_name,
      "sender_email" => admin_user.email.to_s.presence || "admin@techflash.app",
      "techflash_url" => "#{base_url}/for-companies",
      "signup_url" => "#{base_url}/login?tab=signup&role=company",
      "post_job_url" => "#{base_url}/jobs/create",
      "calendar_url" => ENV["SALES_CALENDAR_URL"].to_s.strip
    }

    body_plain = CrmEmailTemplates.interpolate(
      CrmEmailTemplates.default_body("sales_call_follow_up"),
      context
    )
    subject = CrmEmailTemplates.interpolate(
      CrmEmailTemplates.default_subject("sales_call_follow_up"),
      context
    )

    body_html = CrmLeadSendEmailService.plain_text_to_html(body_plain)

    CrmMailer.crm_follow_up(
      to: admin_user.email,
      subject: subject,
      body_html: body_html,
      body_plain: body_plain,
      reply_to: admin_user.email,
      show_ctas: true,
      signup_url: context["signup_url"],
      post_job_url: context["post_job_url"],
      techflash_url: context["techflash_url"]
    )
  end
end
