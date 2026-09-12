# frozen_string_literal: true

module Ai
  class InboundFingerprint
    def self.call(contact_id:, body:, attachments: [])
      digest = Digest::SHA256.hexdigest(
        [
          contact_id.to_s.strip,
          normalize_body(body),
          normalize_attachments(attachments).join("|")
        ].join("\n")
      )
      "fp:#{digest}"
    end

    def self.normalize_body(body)
      body.to_s.gsub(/\s+/, " ").strip
    end

    def self.normalize_attachments(urls)
      Array(urls).map { |url| url.to_s.strip.downcase.sub(%r{/+\z}, "") }.reject(&:blank?).uniq.sort
    end
  end
end
