# frozen_string_literal: true

require "cgi"
require "json"
require "net/http"
require "uri"

module Ghl
  class ApiClient
    class Error < StandardError
      attr_reader :status_code, :body, :retryable

      def initialize(message, status_code: nil, body: nil, retryable: false)
        super(message)
        @status_code = status_code
        @body = body
        @retryable = retryable
      end
    end

    BASE_URL = GhlConfiguration::BASE_URL
    MAX_ATTEMPTS = 3
    TRANSIENT_CODES = [429, 500, 502, 503, 504].freeze

    VERSIONS = {
      upsert_contact: "v3",
      get_contact: "v3",
      send_message: "2021-07-28"
    }.freeze

    Response = Struct.new(:ok, :status_code, :body, :error, :retryable, keyword_init: true)

    def initialize(token: GhlConfiguration.private_integration_token, http: nil)
      @token = token
      @http = http
    end

    def upsert_contact(payload)
      request(
        :post,
        "/contacts/upsert",
        version: VERSIONS.fetch(:upsert_contact),
        body: payload
      )
    end

    def get_contact(contact_id)
      request(
        :get,
        "/contacts/#{CGI.escape(contact_id.to_s)}",
        version: VERSIONS.fetch(:get_contact)
      )
    end

    def send_sms(contact_id:, message:)
      request(
        :post,
        "/conversations/messages",
        version: VERSIONS.fetch(:send_message),
        body: {
          type: "SMS",
          contactId: contact_id,
          message: message
        }
      )
    end

    private

    def request(method, path, version:, body: nil)
      unless @token.present?
        return Response.new(ok: false, status_code: nil, body: {}, error: "GHL private integration token is not configured", retryable: false)
      end

      uri = URI.parse("#{BASE_URL}#{path}")
      attempts = 0
      last = nil

      begin
        attempts += 1
        last = perform(method, uri, version: version, body: body)
        return last if last.ok || !last.retryable || attempts >= MAX_ATTEMPTS

        sleep(retry_delay(attempts)) unless Rails.env.test?
      end while attempts < MAX_ATTEMPTS

      last
    end

    def perform(method, uri, version:, body:)
      if @http
        return @http.call(method: method, uri: uri, version: version, body: body, token: @token)
      end

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 8
      http.read_timeout = 20

      req = (method == :get) ? Net::HTTP::Get.new(uri.request_uri) : Net::HTTP::Post.new(uri.request_uri)
      req["Authorization"] = "Bearer #{@token}"
      req["Version"] = version
      req["Accept"] = "application/json"
      req["Content-Type"] = "application/json"
      req.body = JSON.generate(body) if body && method != :get

      res = http.request(req)
      parsed = parse_body(res.body)
      code = res.code.to_i
      ok = res.is_a?(Net::HTTPSuccess)
      Response.new(
        ok: ok,
        status_code: code,
        body: parsed,
        error: ok ? nil : error_message(parsed, code),
        retryable: TRANSIENT_CODES.include?(code)
      )
    rescue StandardError => e
      Response.new(
        ok: false,
        status_code: nil,
        body: {},
        error: "#{e.class}: #{e.message}",
        retryable: true
      )
    end

    def parse_body(raw)
      return {} if raw.to_s.strip.blank?

      JSON.parse(raw)
    rescue JSON::ParserError
      { "raw" => raw.to_s.truncate(500) }
    end

    def error_message(parsed, code)
      parsed["message"].presence || parsed["error"].presence || "GHL request failed (#{code})"
    end

    def retry_delay(attempt)
      0.25 * attempt
    end
  end
end
