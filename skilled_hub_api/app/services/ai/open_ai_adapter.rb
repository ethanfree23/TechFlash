# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

module Ai
  class OpenAiAdapter
    DEFAULT_MODEL = "gpt-4o-mini"
    DEFAULT_URL = "https://api.openai.com/v1/chat/completions"
    TIMEOUT = 25

    def self.configured?
      ENV["OPENAI_API_KEY"].to_s.strip.present?
    end

    def configured?
      self.class.configured?
    end

    def generate_structured(system:, user:, schema:, model: nil, **_opts)
      unless configured?
        return Client::Result.new(ok: false, error: "OPENAI_API_KEY is not configured")
      end

      payload = {
        model: (model.presence || ENV["OPENAI_MODEL"].presence || DEFAULT_MODEL),
        temperature: 0.2,
        messages: [
          { role: "system", content: system.to_s },
          { role: "user", content: user.is_a?(String) ? user : JSON.generate(user) }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "technician_verification_turn",
            strict: true,
            schema: schema
          }
        }
      }

      response = post_json(payload)
      unless response[:ok]
        return Client::Result.new(ok: false, error: response[:error], raw: response[:body])
      end

      content = extract_content(response[:body])
      parsed = parse_json(content)
      if parsed.nil?
        return Client::Result.new(ok: false, error: "AI returned invalid JSON", raw: content)
      end

      Client::Result.new(ok: true, data: parsed, raw: content)
    rescue StandardError => e
      Client::Result.new(ok: false, error: "#{e.class}: #{e.message}")
    end

    private

    def post_json(payload)
      uri = URI.parse(ENV["OPENAI_API_URL"].presence || DEFAULT_URL)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = 5
      http.read_timeout = TIMEOUT

      req = Net::HTTP::Post.new(uri.request_uri)
      req["Authorization"] = "Bearer #{ENV["OPENAI_API_KEY"].to_s.strip}"
      req["Content-Type"] = "application/json"
      req.body = JSON.generate(payload)

      res = http.request(req)
      body = parse_json(res.body) || {}
      if res.is_a?(Net::HTTPSuccess)
        { ok: true, body: body }
      else
        message = body.dig("error", "message").presence || "OpenAI HTTP #{res.code}"
        { ok: false, error: message, body: body }
      end
    rescue SocketError, Errno::ECONNREFUSED, Net::OpenTimeout, Net::ReadTimeout => e
      { ok: false, error: "OpenAI request failed (#{e.class})" }
    end

    def extract_content(body)
      body.to_h.dig("choices", 0, "message", "content").to_s
    end

    def parse_json(raw)
      return raw if raw.is_a?(Hash)
      return nil if raw.blank?

      JSON.parse(raw)
    rescue JSON::ParserError
      nil
    end
  end
end
