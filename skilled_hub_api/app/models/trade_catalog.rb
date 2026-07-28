class TradeCatalog
  OPTIONS = [
    "Electrician",
    "HVAC Technician",
    "Plumber",
    "Automobile Technician",
    "Roofer",
    "Carpenter",
    "Machine Technician (Industrial Maintenance)",
    "Welder",
    "Refrigeration Technician",
    "Pipefitter",
    "Sheet Metal Worker",
    "Mason / Concrete Worker",
    "Drywall / Painter",
    "Glazier",
    "Insulation Installer",
    "Boilermaker",
    "Fire Protection / Sprinkler Tech",
    "Solar Installer",
    "Low-Voltage / Telecom Tech",
    "Locksmith",
    "Appliance Repair Tech",
    "Equipment Operator",
    "General Laborer / Helper"
  ].freeze

  LEGACY_SKILL_MAP = {
    "hvac" => "HVAC Technician",
    "heating ventilation air conditioning" => "HVAC Technician",
    "electrical" => "Electrician",
    "electric" => "Electrician",
    "electrician" => "Electrician",
    "plumbing" => "Plumber",
    "plumber" => "Plumber",
    "refrigeration" => "Refrigeration Technician",
    "sheet metal" => "Sheet Metal Worker",
    "general labor" => "General Laborer / Helper"
  }.freeze

  def self.normalized_label(raw_value)
    value = raw_value.to_s.strip
    return nil if value.blank?

    direct = OPTIONS.find { |opt| opt.casecmp?(value) }
    return direct if direct.present?

    slug = value.downcase.gsub(/[^a-z0-9]+/, " ").strip
    mapped = LEGACY_SKILL_MAP[slug]
    return mapped if mapped.present?

    nil
  end

  def self.valid_label?(raw_value)
    normalized_label(raw_value).present?
  end
end
