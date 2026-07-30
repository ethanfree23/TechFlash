# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

# Delivers via Mailtrap Transactional API (HTTPS). Use on hosts that block outbound SMTP (e.g. Railway).
# https://send.api.mailtrap.io/api/send — same API token as SMTP password.
class MailtrapHttpDelivery
  API_URL = "https://send.api.mailtrap.io/api/send"
  FORWARDED_HEADERS = [
    "List-Unsubscribe",
    "List-Unsubscribe-Post",
    "Precedence",
    "X-Auto-Response-Suppress",
    "Feedback-ID"
  ].freeze

  attr_accessor :settings

  def initialize(settings = {})
    self.settings = settings
  end

  def deliver!(mail)
    s = settings.respond_to?(:symbolize_keys) ? settings.symbolize_keys : settings
    token = s[:api_token].presence || s["api_token"].presence || raise(ArgumentError, "MailtrapHttpDelivery: missing api_token")
    payload = build_payload(mail)

    uri = URI.parse(API_URL)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 15
    http.read_timeout = 30

    req = Net::HTTP::Post.new(uri.path)
    req["Authorization"] = "Bearer #{token}"
    req["Content-Type"] = "application/json"
    req.body = JSON.generate(payload)

    res = http.request(req)
    return if res.code.to_i.between?(200, 299)

    raise "Mailtrap API HTTP #{res.code}: #{res.body}"
  end

  private

  def build_payload(mail)
    from_email = Array(mail.from).first || raise(ArgumentError, "missing From")
    to_list = Array(mail.to).compact.presence || raise(ArgumentError, "missing To")

    text, html = extract_parts(mail)

    if text.blank? && html.blank?
      text = "(no body)"
    elsif text.blank? && html.present?
      text = html.gsub(/<[^>]*>/, " ").squeeze(" ").strip
    end

    payload = {
      from: { email: from_email },
      to: to_list.map { |e| { email: e } },
      subject: mail.subject.to_s
    }
    payload[:text] = text if text.present?
    payload[:html] = html if html.present?
    payload[:cc] = normalized_addresses(mail.cc) if Array(mail.cc).compact.any?
    payload[:bcc] = normalized_addresses(mail.bcc) if Array(mail.bcc).compact.any?
    payload[:reply_to] = normalized_addresses(mail.reply_to) if Array(mail.reply_to).compact.any?

    forwarded_headers = extract_forwarded_headers(mail)
    payload[:headers] = forwarded_headers if forwarded_headers.present?
    payload
  end

  def normalized_addresses(addresses)
    Array(addresses).compact.map(&:to_s).map(&:strip).reject(&:blank?).uniq.map { |email| { email: email } }
  end

  def extract_forwarded_headers(mail)
    FORWARDED_HEADERS.each_with_object({}) do |header_name, memo|
      value = mail.header[header_name]&.value.to_s.strip
      memo[header_name] = value if value.present?
    end
  end

  def extract_parts(mail)
    if mail.multipart?
      [mail.text_part&.decoded, mail.html_part&.decoded]
    else
      body = mail.body&.decoded.to_s
      ct = mail.content_type.to_s
      if ct.include?("html")
        [nil, body]
      else
        [body, nil]
      end
    end
  end
end
