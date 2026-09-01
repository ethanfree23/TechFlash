class TechnicianProfile < ApplicationRecord
  GEOCODE_STATUSES = %w[pending success failed].freeze

  has_one_attached :avatar

  attr_accessor :client_coordinates_provided

  before_save :sync_location_from_address
  before_save :apply_geocoding
  before_validation :normalize_membership_level
  before_validation :normalize_skill_class

  belongs_to :user
  has_many :job_applications, dependent: :destroy
  has_many :job_counter_offers, dependent: :destroy
  has_many :conversations, dependent: :destroy
  has_many :messages, through: :conversations
  has_many :documents, as: :uploadable, dependent: :destroy
  has_many :ratings_received, -> { order(created_at: :desc) }, class_name: 'Rating', as: :reviewee, dependent: :destroy
  has_many :saved_job_searches, dependent: :destroy
  has_many :favorite_technician_entries, class_name: 'FavoriteTechnician', dependent: :destroy
  has_many :companies_that_favorited, through: :favorite_technician_entries, source: :company_profile

  validate :membership_level_must_be_configured
  validate :skill_class_must_be_catalog_value
  validates :phone, presence: true, on: :update

  def average_rating
    Rating.average_for(self)
  end

  def review_summary
    Rating.weighted_summary_for(self)
  end

  def verification_badges
    VerificationBadge.active_now.where(user_id: user_id).pluck(:badge_type)
  end

  def map_ready?
    CoordinateValidator.valid?(latitude, longitude, country: country)
  end

  private

  def sync_location_from_address
    return unless city.present? || state.present? || country.present?
    parts = [city, state, country].compact.reject(&:blank?)
    self.location = parts.join(', ') if parts.any?
  end

  def apply_geocoding
    address_changed_for_geocode =
      new_record? || address_changed? || city_changed? || state_changed? || zip_code_changed? || country_changed?

    incoming = CoordinateValidator.pair(latitude, longitude, country: country)
    client_provided = ActiveModel::Type::Boolean.new.cast(client_coordinates_provided)

    if address_changed_for_geocode && client_provided && incoming.valid?
      assign_successful_coordinates!(incoming)
      return
    end

    if !address_changed_for_geocode && incoming.valid?
      self.geocode_status = "success" if geocode_status != "success"
      return
    end

    unless address.present? || city.present?
      reject_invalid_stored_coordinates!
      return
    end

    coords = GeocodingService.geocode(
      address: address,
      city: city,
      state: state,
      zip_code: zip_code,
      country: country
    )
    geocoded = coords && CoordinateValidator.pair(coords[0], coords[1], country: country)
    if geocoded&.valid?
      assign_successful_coordinates!(geocoded)
    elsif address_changed_for_geocode || !incoming.valid?
      clear_coordinates!(status: "failed")
    end
  rescue StandardError => e
    Rails.logger.warn("TechnicianProfile geocoding failed: #{e.message}")
    if address_changed_for_geocode || !CoordinateValidator.valid?(latitude, longitude, country: country)
      clear_coordinates!(status: "failed")
    end
  ensure
    reject_invalid_stored_coordinates!
  end

  def assign_successful_coordinates!(pair)
    self.latitude = pair.latitude
    self.longitude = pair.longitude
    self.geocode_status = "success"
    self.geocoded_at = Time.current
  end

  def clear_coordinates!(status:)
    self.latitude = nil
    self.longitude = nil
    self.geocode_status = status
    self.geocoded_at = Time.current
  end

  # Never persist 0,0 / Null Island / garbage — Numeric#blank? is false for 0 in Rails 7.1.
  def reject_invalid_stored_coordinates!
    return if latitude.nil? && longitude.nil?
    return if CoordinateValidator.valid?(latitude, longitude, country: country)

    clear_coordinates!(status: "failed")
  end

  def normalize_membership_level
    self.membership_level = MembershipPolicy.normalized_level(membership_level, audience: :technician)
  end

  def membership_level_must_be_configured
    return if membership_level.blank?

    unless MembershipPolicy.level_valid?(membership_level, audience: :technician)
      errors.add(:membership_level, "is not a valid tier")
    end
  end

  def normalize_skill_class
    normalized = TechnicianClassCatalog.normalized_label(skill_class)
    self.skill_class = normalized.presence || skill_class.to_s.strip.presence
  end

  def skill_class_must_be_catalog_value
    return if skill_class.blank?
    return if TechnicianClassCatalog.valid_label?(skill_class)

    errors.add(:skill_class, "must be Apprentice, Journeyman, or Master.")
  end
end
