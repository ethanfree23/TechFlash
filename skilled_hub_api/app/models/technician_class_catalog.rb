# frozen_string_literal: true

class TechnicianClassCatalog
  SLUGS = %w[apprentice journeyman master].freeze

  LABELS = {
    "apprentice" => "Apprentice",
    "journeyman" => "Journeyman",
    "master" => "Master"
  }.freeze

  def self.normalized_slug(raw_value)
    value = raw_value.to_s.strip
    return nil if value.blank?

    slug = value.downcase.gsub(/[\s-]+/, "_")
    return slug if SLUGS.include?(slug)

    LABELS.find { |_slug, label| label.casecmp?(value) }&.first
  end

  def self.normalized_label(raw_value)
    normalized_slug(raw_value)
  end

  def self.valid_label?(raw_value)
    normalized_slug(raw_value).present?
  end

  def self.label_for(raw_value)
    slug = normalized_slug(raw_value)
    return LABELS[slug] if slug

    raw_value.to_s.strip.presence
  end
end
