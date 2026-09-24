class CompanyProfile < ApplicationRecord

  has_one_attached :avatar

  before_validation :normalize_service_cities_list
  before_validation :normalize_service_trades_list
  before_validation :normalize_membership_level
  before_validation :normalize_state_and_license
  before_validation :normalize_business_zip_code
  before_save :sync_location_from_service_cities

  belongs_to :user, inverse_of: :company_profile
  has_many :company_users, class_name: "User", foreign_key: :company_profile_id, inverse_of: :shared_company_profile, dependent: :nullify
  has_many :jobs, dependent: :destroy
  has_many :job_counter_offers, dependent: :destroy
  has_many :conversations, dependent: :destroy
  has_many :messages, through: :conversations
  has_many :documents, as: :uploadable, dependent: :destroy
  has_many :ratings_received, -> { order(created_at: :desc) }, class_name: 'Rating', as: :reviewee, dependent: :destroy
  has_many :favorite_technician_entries, class_name: 'FavoriteTechnician', dependent: :destroy
  has_many :favorite_technician_profiles, through: :favorite_technician_entries, source: :technician_profile

  validate :membership_level_must_be_configured
  validate :service_trades_must_be_valid
  validates :phone, presence: true, on: :update

  def average_rating
    Rating.average_for(self)
  end

  def review_summary
    Rating.weighted_summary_for(self)
  end

  def effective_service_trades
    list = Array(service_trades).map { |v| TradeCatalog.normalized_label(v) }.compact.uniq
    return list if list.present?

    fallback = TradeCatalog.normalized_label(industry)
    fallback.present? ? [fallback] : []
  end

  # Fills a blank location with the ZIP's city and a blank state with the full state name
  # (77002 → location "Houston", state "Texas"). Does not write the ZIP digits into
  # location, and does not replace a city or state the company already has.
  # Returns false only when a ZIP is present but not in the offline table.
  def apply_business_zip_place!
    return true if business_zip_code.blank?
    return true if location.present? && state.present?

    place = UsZipLookup.place_for(business_zip_code)
    return false if place.nil?

    self.location = place[:city] if location.blank?
    self.state = GeocodingService.us_full_state_name_from_abbr(place[:state]) if state.blank?
    true
  end

  private

  def normalize_service_cities_list
    raw = service_cities
    arr =
      case raw
      when String
        begin
          parsed = JSON.parse(raw)
          parsed.is_a?(Array) ? parsed : []
        rescue JSON::ParserError
          []
        end
      else
        Array(raw)
      end
    self.service_cities = arr.map { |c| c.to_s.strip.presence }.compact.uniq
  end

  def normalize_service_trades_list
    raw = service_trades
    arr =
      case raw
      when String
        begin
          parsed = JSON.parse(raw)
          parsed.is_a?(Array) ? parsed : []
        rescue JSON::ParserError
          []
        end
      else
        Array(raw)
      end
    normalized = arr.map { |trade| TradeCatalog.normalized_label(trade) }.compact.uniq
    self.service_trades = normalized
  end

  def sync_location_from_service_cities
    cities = Array(service_cities).map(&:to_s).map(&:strip).reject(&:blank?)
    return if location.present?

    self.location = cities.join(", ") if cities.any?
  end

  def normalize_membership_level
    self.membership_level = MembershipPolicy.normalized_level(membership_level, audience: :company)
  end

  def normalize_state_and_license
    self.state = state.to_s.strip.presence
    self.electrical_license_number = electrical_license_number.to_s.strip.presence
  end

  # The company's own business ZIP (signup form or GHL/Meta onboarding): the first 5-digit
  # run, or nil. Company-level only; jobs collect their own location.
  def normalize_business_zip_code
    return unless has_attribute?(:business_zip_code)

    self.business_zip_code = business_zip_code.to_s[/\b\d{5}\b/]
  end

  def membership_level_must_be_configured
    return if membership_level.blank?

    unless MembershipPolicy.level_valid?(membership_level, audience: :company)
      errors.add(:membership_level, "is not a valid tier")
    end
  end

  def service_trades_must_be_valid
    invalid = Array(service_trades).reject { |label| TradeCatalog.valid_label?(label) }
    return if invalid.empty?

    errors.add(:service_trades, "must be selected from the approved trade list")
  end
end
