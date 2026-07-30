class ApplicationMailer < ActionMailer::Base
  include ApplicationHelper
  default(
    from: -> { ENV.fetch("MAILER_FROM", "TechFlash <noreply@techflash.app>") },
    reply_to: -> { ENV.fetch("MAILER_REPLY_TO", "support@techflash.app") }
  )
  layout "mailer"
  helper ApplicationHelper
  before_action :assign_email_branding
  before_action :apply_transactional_headers
  after_deliver :record_outbound_email_log

  private

  def record_outbound_email_log
    msg = message
    raw_to = msg.respond_to?(:to) ? msg.to : nil
    recipients =
      Array(raw_to).flatten.compact.map { |a| a.to_s.strip.downcase }.uniq.reject(&:blank?)
    return if recipients.empty?

    klass = self.class.name
    action = action_name.to_s
    subj = msg.subject.to_s.truncate(500)

    now = Time.current
    rows =
      recipients.map do |addr|
        matched_user = User.find_by("LOWER(email) = ?", addr)
        {
          user_id: matched_user&.id,
          to_email: addr,
          mailer_class: klass,
          mailer_action: action,
          subject: subj,
          created_at: now
        }
      end

    EmailDeliveryLog.insert_all(rows)
  rescue StandardError => e
    Rails.logger.error(
      "[email_delivery_log] #{e.class}: #{e.message}\n#{Array(e.backtrace).first(8).join("\n")}"
    )
  end

  def assign_email_branding
    @email_asset_base_url = ENV.fetch("EMAIL_ASSET_BASE_URL", ENV.fetch("FRONTEND_URL", "http://localhost:5173")).to_s.chomp("/")
    @email_logo_url = ENV.fetch("EMAIL_LOGO_URL", "#{@email_asset_base_url}/techflash-logo.png")
    @email_brand_font_family = ENV.fetch("EMAIL_BRAND_FONT_FAMILY", "inherit")
    @email_brand_font_url = ENV["EMAIL_BRAND_FONT_URL"].to_s.presence
    @frontend_base_url = ENV.fetch("FRONTEND_URL", "http://localhost:5173").to_s.chomp("/")
    @notification_settings_url = "#{@frontend_base_url}/settings?tab=notifications"
    @support_email = ENV.fetch("MAILER_REPLY_TO", "support@techflash.app")
    @support_mailto_url = "mailto:#{@support_email}"
  end

  def apply_transactional_headers
    headers["X-Auto-Response-Suppress"] = "All"
    headers["Precedence"] = "list"
    headers["List-Unsubscribe"] = "<#{@notification_settings_url}>, <#{@support_mailto_url}?subject=Unsubscribe>"
  end

  def email_asset_base_url
    @email_asset_base_url || ENV.fetch("EMAIL_ASSET_BASE_URL", ENV.fetch("FRONTEND_URL", "http://localhost:5173")).to_s.chomp("/")
  end

  def email_logo_url
    @email_logo_url || ENV.fetch("EMAIL_LOGO_URL", "#{email_asset_base_url}/techflash-logo.png")
  end

  def email_brand_font_family
    @email_brand_font_family || ENV.fetch("EMAIL_BRAND_FONT_FAMILY", "inherit")
  end

  def email_brand_font_url
    return @email_brand_font_url if defined?(@email_brand_font_url)

    ENV["EMAIL_BRAND_FONT_URL"].to_s.presence
  end
end
