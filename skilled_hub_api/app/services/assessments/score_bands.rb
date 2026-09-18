# frozen_string_literal: true

module Assessments
  # Parses, validates and resolves an assessment version's score bands.
  #
  # Bands are stored as JSON on assessment_versions.score_bands so each
  # assessment (and each version of it) can carry its own labels and thresholds
  # without a migration:
  #
  #   [
  #     { "slug" => "foundational", "label" => "Foundational",
  #       "min_score" => 0,  "max_score" => 39 },
  #     { "slug" => "developing",   "label" => "Developing",
  #       "min_score" => 40, "max_score" => 59 }
  #   ]
  #
  # Bands are optional. When present they must tile 0..100 exactly, so every
  # score resolves to precisely one band.
  class ScoreBands
    REQUIRED_KEYS = %w[slug label min_score max_score].freeze

    # Provisional starting thresholds used by the importer when a version does
    # not declare its own bands. Final labels/thresholds are decided per
    # assessment when its question bank is built, which is why this lives here
    # as an overridable template rather than as scoring logic.
    STARTER_TEMPLATE = [
      { "slug" => "foundational", "label" => "Foundational", "min_score" => 0, "max_score" => 39 },
      { "slug" => "developing", "label" => "Developing", "min_score" => 40, "max_score" => 59 },
      { "slug" => "apprentice", "label" => "Apprentice", "min_score" => 60, "max_score" => 74 },
      { "slug" => "advanced_apprentice", "label" => "Advanced Apprentice", "min_score" => 75, "max_score" => 89 },
      { "slug" => "strong_knowledge", "label" => "Strong Knowledge", "min_score" => 90, "max_score" => 100 }
    ].freeze

    attr_reader :bands, :errors

    def initialize(raw)
      @bands = normalize(raw)
      @errors = []
      validate!
    end

    def self.starter_template
      STARTER_TEMPLATE.map(&:dup)
    end

    def present?
      bands.any?
    end

    def valid?
      errors.empty?
    end

    # Returns the band covering `score`, or nil when no bands are configured.
    def resolve(score)
      return nil if score.nil? || bands.empty?

      value = score.to_i
      bands.find { |band| value >= band["min_score"] && value <= band["max_score"] }
    end

    def label_for(score)
      resolve(score)&.fetch("label", nil)
    end

    def slug_for(score)
      resolve(score)&.fetch("slug", nil)
    end

    def as_json(*)
      bands.map(&:dup)
    end

    private

    def normalize(raw)
      list =
        case raw
        when String then safe_parse(raw)
        when Array then raw
        when nil then []
        else Array(raw)
        end

      list.filter_map do |entry|
        next nil unless entry.respond_to?(:to_h)

        band = entry.to_h.stringify_keys
        {
          "slug" => band["slug"].to_s.strip,
          "label" => band["label"].to_s.strip,
          "min_score" => cast_integer(band["min_score"]),
          "max_score" => cast_integer(band["max_score"])
        }
      end.sort_by { |band| [band["min_score"] || 0, band["max_score"] || 0] }
    end

    def safe_parse(raw)
      parsed = JSON.parse(raw)
      parsed.is_a?(Array) ? parsed : []
    rescue JSON::ParserError
      []
    end

    def cast_integer(value)
      return nil if value.nil? || value.to_s.strip.empty?

      Integer(value.to_s.strip, exception: false)
    end

    def validate!
      return if bands.empty?

      validate_entries!
      return if errors.any?

      validate_coverage!
    end

    def validate_entries!
      slugs = []
      bands.each_with_index do |band, index|
        position = index + 1
        REQUIRED_KEYS.each do |key|
          errors << "band #{position} is missing #{key}" if band[key].nil? || band[key].to_s.strip.empty?
        end
        next if errors.any?

        min = band["min_score"]
        max = band["max_score"]
        errors << "band #{position} min_score and max_score must be between 0 and 100" unless min.between?(0, 100) && max.between?(0, 100)
        errors << "band #{position} min_score must not exceed max_score" if min > max
        errors << "band slug #{band['slug']} is duplicated" if slugs.include?(band["slug"])
        slugs << band["slug"]
      end
    end

    def validate_coverage!
      expected_next = 0
      bands.each do |band|
        if band["min_score"] > expected_next
          errors << "score bands leave #{expected_next}-#{band['min_score'] - 1} uncovered"
          return
        end
        if band["min_score"] < expected_next
          errors << "score bands overlap at #{band['min_score']}"
          return
        end

        expected_next = band["max_score"] + 1
      end

      errors << "score bands must cover through 100 (stops at #{expected_next - 1})" if expected_next <= 100
    end
  end
end
