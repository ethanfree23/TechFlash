module ContentSafetyValidations
  extend ActiveSupport::Concern

  BLOCKED_TERMS = %w[
    nigger
    faggot
    kike
    cunt
    chink
    wetback
    rapist
  ].freeze

  SPAM_LINK_PATTERN = %r{https?://}i

  class_methods do
    def validates_safe_text(*fields, max_length:)
      fields.each do |field|
        validates field, length: { maximum: max_length }, allow_blank: true
        validate do
          value = self[field].to_s
          next if value.blank?

          if contains_blocked_terms?(value)
            errors.add(field, "contains prohibited language")
          end
          if excessive_links?(value)
            errors.add(field, "contains too many links")
          end
        end
      end
    end
  end

  private

  def contains_blocked_terms?(text)
    normalized = text.to_s.downcase
    BLOCKED_TERMS.any? { |term| normalized.include?(term) }
  end

  def excessive_links?(text)
    text.to_s.scan(SPAM_LINK_PATTERN).length > 2
  end
end
