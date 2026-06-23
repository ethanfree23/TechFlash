class TechnicianProfile < ApplicationRecord
  has_one_attached :avatar

  before_save :sync_location_from_address
  before_save :geocode_address
  before_validation :normalize_membership_level

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

  private

  def sync_location_from_address
    return unless city.present? || state.present? || country.present?
    parts = [city, state, country].compact.reject(&:blank?)
    self.location = parts.join(', ') if parts.any?
  end

  def geocode_address
    return unless address.present? || city.present?
    needs_coordinates = latitude.blank? || longitude.blank?
    address_changed_for_geocode =
      new_record? || address_changed? || city_changed? || state_changed? || zip_code_changed? || country_changed?
    return unless needs_coordinates || address_changed_for_geocode
    coords = GeocodingService.geocode(
      address: address,
      city: city,
      state: state,
      zip_code: zip_code,
      country: country
    )
    self.latitude = coords[0] if coords
    self.longitude = coords[1] if coords
  rescue StandardError => e
    Rails.logger.warn("TechnicianProfile geocoding failed: #{e.message}")
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
end
