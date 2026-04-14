class TechnicianProfile < ApplicationRecord
  has_one_attached :avatar

  before_save :sync_location_from_address
  before_save :geocode_address

  belongs_to :user
  has_many :job_applications, dependent: :destroy
  has_many :conversations, dependent: :destroy
  has_many :messages, through: :conversations
  has_many :documents, as: :uploadable, dependent: :destroy
  has_many :ratings_received, -> { order(created_at: :desc) }, class_name: 'Rating', as: :reviewee, dependent: :destroy
  has_many :saved_job_searches, dependent: :destroy
  has_many :favorite_technician_entries, class_name: 'FavoriteTechnician', dependent: :destroy
  has_many :companies_that_favorited, through: :favorite_technician_entries, source: :company_profile

  def average_rating
    Rating.average_for(self)
  end

  private

  def sync_location_from_address
    return unless city.present? || state.present? || country.present?
    parts = [city, state, country].compact.reject(&:blank?)
    self.location = parts.join(', ') if parts.any?
  end

  def geocode_address
    return unless address.present? || city.present?
    return unless new_record? || address_changed? || city_changed? || state_changed? || zip_code_changed? || country_changed?
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
end
