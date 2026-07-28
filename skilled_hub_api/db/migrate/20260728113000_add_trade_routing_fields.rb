class AddTradeRoutingFields < ActiveRecord::Migration[7.1]
  class MigrationCompanyProfile < ApplicationRecord
    self.table_name = "company_profiles"
  end

  class MigrationJob < ApplicationRecord
    self.table_name = "jobs"
  end

  TRADE_OPTIONS = [
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

  def up
    add_column :company_profiles, :service_trades, :json, default: [], null: false
    add_column :jobs, :trade_type, :string
    add_index :jobs, :trade_type

    MigrationCompanyProfile.reset_column_information
    MigrationJob.reset_column_information

    MigrationCompanyProfile.find_each do |company|
      normalized_industry = normalized_trade_label(company.industry)
      service_trades = []
      service_trades << normalized_industry if normalized_industry.present?
      company.update_columns(service_trades: service_trades.uniq)
    end

    MigrationJob.find_each do |job|
      candidate = normalized_trade_label(job.skill_class)
      if candidate.blank?
        company = MigrationCompanyProfile.find_by(id: job.company_profile_id)
        company_trades = Array(company&.service_trades).map { |v| normalized_trade_label(v) }.compact.uniq
        candidate = company_trades.first if company_trades.length == 1
      end
      job.update_columns(trade_type: candidate) if candidate.present?
    end
  end

  def down
    remove_index :jobs, :trade_type
    remove_column :jobs, :trade_type
    remove_column :company_profiles, :service_trades
  end

  private

  def normalized_trade_label(raw_value)
    value = raw_value.to_s.strip
    return nil if value.blank?

    direct = TRADE_OPTIONS.find { |opt| opt.casecmp?(value) }
    return direct if direct.present?

    slug = value.downcase.gsub(/[^a-z0-9]+/, " ").strip
    LEGACY_SKILL_MAP[slug]
  end
end
