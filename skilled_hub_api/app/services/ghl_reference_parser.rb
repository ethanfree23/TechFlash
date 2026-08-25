# frozen_string_literal: true

class GhlReferenceParser
  PHONE_REGEX = /(?:\+?1[\s.\-]*)?(?:\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}|\d{10,11})/

  def self.parse(raw)
    split_chunks(raw).filter_map { |chunk| parse_chunk(chunk) }
  end

  def self.split_chunks(raw)
    text = raw.to_s.strip
    return [] if text.blank?

    parts = text.split(/\r?\n/).map(&:strip).reject(&:blank?)
    parts = text.split(/\s*;\s*/).map(&:strip).reject(&:blank?) if parts.size <= 1
    if parts.size == 1 && text.match?(/\d+[\.)]\s/)
      parts = text.split(/(?=\d+[\.)]\s)/).map(&:strip).reject(&:blank?)
    end
    parts
  end

  def self.parse_chunk(chunk)
    cleaned = chunk.to_s.sub(/\A\d+[\.)]\s*/, "").strip
    match = cleaned.match(PHONE_REGEX)
    return nil unless match

    phone = match[0]
    name = cleaned[0...match.begin(0)].gsub(/[,:\-\s]+\z/, "").strip
    return nil if name.blank?

    after = cleaned[match.end(0)..].to_s.sub(/\A[,\s]+/, "").strip
    extras = after.split(",").map(&:strip).reject(&:blank?)

    {
      full_name: name,
      phone: phone,
      company_name: extras[0],
      relationship: extras[1]
    }
  end
end
