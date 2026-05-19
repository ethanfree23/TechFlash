# frozen_string_literal: true

require_relative "../../config/mail_env"

# Wraps mail sends so SMTP/template failures do not fail HTTP requests.
# Uses deliver_now (not deliver_later) so sends run inline and never depend on Active Job.
module MailDelivery
  def self.audit_status
    mailtrap_http = MailEnv.mailtrap_http_delivery?

    delivery_mode =
      if mailtrap_http
        "mailtrap_http"
      elsif ENV['SMTP_ADDRESS'].present?
        "smtp"
      else
        "not_configured"
      end

    {
      delivery_mode: delivery_mode,
      use_http_flag: ENV['MAILTRAP_USE_HTTP'],
      from_present: ENV['MAILER_FROM'].present?,
      smtp_address_present: ENV['SMTP_ADDRESS'].present?,
      smtp_username_present: ENV['SMTP_USERNAME'].present?,
      smtp_password_present: ENV['SMTP_PASSWORD'].present?,
      mailtrap_token_present: ENV['MAILTRAP_API_TOKEN'].present?,
      can_send: can_send_mail?(mailtrap_http)
    }
  end

  # Returns { success: true, value: ... } or { success: false, error: "..." }.
  # Use this in admin/diagnostics UIs (e.g. Email QA).
  def self.safe_deliver_result
    if defined?(DemoMode) && DemoMode.enabled?
      Rails.logger.info("[mail] demo: simulated delivery (not sent)")
      return { success: true, value: nil, simulated: true }
    end

    st = audit_status
    mailtrap_http = st[:delivery_mode] == 'mailtrap_http'

    if mailtrap_http
      if ENV['MAILTRAP_API_TOKEN'].blank? && ENV['SMTP_PASSWORD'].blank?
        msg = "Mailtrap HTTP: set MAILTRAP_API_TOKEN or SMTP_PASSWORD (use your Sending API token) on the API host."
        Rails.logger.error("[mail] #{msg}")
        return { success: false, error: msg }
      end
    elsif ENV['SMTP_ADDRESS'].blank?
      msg = "SMTP_ADDRESS is unset — cannot send mail. Set it on the Railway API service."
      Rails.logger.error("[mail] #{msg}")
      return { success: false, error: msg }
    elsif ENV['SMTP_PASSWORD'].blank?
      msg = "SMTP_PASSWORD is unset. For Mailtrap live SMTP, use your API token as the password (user is often 'api')."
      Rails.logger.error("[mail] #{msg}")
      return { success: false, error: msg }
    end

    Rails.logger.warn("[mail] sending via=#{mailtrap_http ? 'mailtrap_http' : 'smtp'}")

    begin
      value = yield
      Rails.logger.warn("[mail] sent OK")
      { success: true, value: value }
    rescue StandardError => e
      Rails.logger.error("[mail] #{e.class}: #{e.message}\n#{e.backtrace.first(12).join("\n")}")
      msg = "#{e.class}: #{e.message}"
      if !mailtrap_http && e.class.name == "Net::OpenTimeout"
        msg += " Outbound SMTP is blocked on many cloud hosts (Railway, etc.). Switch to Mailtrap’s HTTP API (HTTPS)—do not change SMTP_PORT. Set MAILTRAP_USE_HTTP=true and put your Sending API token in MAILTRAP_API_TOKEN or SMTP_PASSWORD; leave SMTP_PORT at 587 or unset."
      end
      { success: false, error: msg }
    end
  end

  def self.safe_deliver
    r = safe_deliver_result { yield }
    r[:success] ? r[:value] : nil
  end

  def self.can_send_mail?(mailtrap_http)
    if mailtrap_http
      ENV['MAILTRAP_API_TOKEN'].present? || ENV['SMTP_PASSWORD'].present?
    else
      ENV['SMTP_ADDRESS'].present? && ENV['SMTP_PASSWORD'].present?
    end
  end
  private_class_method :can_send_mail?
end
