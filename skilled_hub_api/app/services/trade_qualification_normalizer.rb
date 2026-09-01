# frozen_string_literal: true

# Normalizes per-trade line items (type, class, years) and keeps them in sync
# with the legacy scalar columns (trade_type, skill_class, experience_years, specialties).
class TradeQualificationNormalizer
  def self.normalize_list(raw)
    seen = {}
    Array(raw).filter_map { |item| normalize_item(item) }.each_with_object([]) do |item, acc|
      key = item[:trade_type].downcase
      next if seen[key]

      seen[key] = true
      acc << item
    end
  end

  def self.normalize_item(item)
    if item.is_a?(String)
      trade = canonical_or_raw(item)
      return nil if trade.blank?

      return qualification_hash(trade, nil, nil)
    end

    return nil unless item.respond_to?(:to_h)

    hash = item.respond_to?(:to_unsafe_h) ? item.to_unsafe_h : item.to_h
    hash = hash.with_indifferent_access
    trade = canonical_or_raw(hash[:trade_type] || hash[:trade] || hash[:label])
    return nil if trade.blank?

    skill = TechnicianClassCatalog.normalized_slug(hash[:skill_class] || hash[:class] || hash[:level])
    years = parse_years(hash[:experience_years] || hash[:years])
    qualification_hash(trade, skill, years)
  end

  def self.from_scalars(trade_type:, skill_class:, experience_years:, specialties:, previous: [])
    previous_by_trade = {}
    normalize_list(previous).each { |qual| previous_by_trade[qual[:trade_type].downcase] = qual }

    names = []
    primary = canonical_or_raw(trade_type)
    names << primary if primary.present?
    Array(specialties).each do |entry|
      label =
        if entry.is_a?(Hash)
          entry = entry.with_indifferent_access
          entry[:trade_type] || entry[:trade] || entry[:label]
        else
          entry
        end
      name = canonical_or_raw(label)
      names << name if name.present? && names.none? { |existing| existing.casecmp?(name) }
    end

    names.map.with_index do |trade, index|
      prev = previous_by_trade[trade.downcase]
      skill =
        if index.zero?
          TechnicianClassCatalog.normalized_slug(skill_class).presence || prev&.[](:skill_class)
        else
          prev&.[](:skill_class)
        end
      years =
        if index.zero?
          parsed = parse_years(experience_years)
          parsed.nil? ? prev&.[](:experience_years) : parsed
        else
          prev&.[](:experience_years)
        end
      qualification_hash(trade, skill, years)
    end
  end

  def self.apply_to_profile!(profile, qualifications)
    normalized = normalize_list(qualifications)
    profile.trade_qualifications = normalized.as_json
    primary = normalized.first
    if primary
      profile.trade_type = primary[:trade_type]
      profile.skill_class = primary[:skill_class] if primary[:skill_class].present?
      profile.experience_years = primary[:experience_years] unless primary[:experience_years].nil?
    end
    profile.specialties = normalized.map { |qual| qual[:trade_type] }
    normalized
  end

  def self.parse_years(value)
    return nil if value.nil?
    return nil if value.is_a?(String) && value.strip.empty?

    n = Integer(value)
    n >= 0 ? n : nil
  rescue ArgumentError, TypeError
    nil
  end

  def self.canonical_or_raw(value)
    TradeCatalog.normalized_label(value).presence || value.to_s.strip.presence
  end

  def self.qualification_hash(trade, skill_class, experience_years)
    {
      "trade_type" => trade,
      "skill_class" => skill_class,
      "experience_years" => experience_years
    }.with_indifferent_access
  end
end
