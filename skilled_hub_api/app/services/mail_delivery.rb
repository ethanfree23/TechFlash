# frozen_string_literal: true

# Wraps mail sends so SMTP/template failures do not fail HTTP requests.
# Uses deliver_now (not deliver_later) so sends run inline and never depend on Active Job.
module MailDelivery
  def self.safe_deliver
    mailtrap_http =
      ENV['MAILTRAP_USE_HTTP'] == 'true' ||
      (ENV['MAILTRAP_USE_HTTP'].blank? && ENV['MAILTRAP_API_TOKEN'].present?)

    if mailtrap_http
      if ENV['MAILTRAP_API_TOKEN'].blank? && ENV['SMTP_PASSWORD'].blank?
        Rails.logger.error('[mail] Mailtrap HTTP requires SMTP_PASSWORD or MAILTRAP_API_TOKEN')
        return nil
      end
    elsif ENV['SMTP_ADDRESS'].blank?
      Rails.logger.error('[mail] SMTP_ADDRESS is unset — cannot send mail. Set it on the Railway app service.')
      return nil
    elsif ENV['SMTP_PASSWORD'].blank?
      Rails.logger.error('[mail] SMTP_PASSWORD is unset — Mailtrap token missing.')
      return nil
    end

    Rails.logger.warn("[mail] sending via=#{mailtrap_http ? 'mailtrap_http' : 'smtp'}")
    yield
    Rails.logger.warn('[mail] sent OK')
  rescue StandardError => e
    Rails.logger.error("[mail] #{e.class}: #{e.message}\n#{e.backtrace.first(12).join("\n")}")
    nil
  end
end
