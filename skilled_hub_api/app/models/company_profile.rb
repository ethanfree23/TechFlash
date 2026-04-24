class CompanyProfile < ApplicationRecord
  has_one_attached :avatar

  before_validation :normalize_service_cities_list
  before_validation :normalize_membership_level
  before_save :sync_location_from_service_cities

  belongs_to :user, inverse_of: :company_profile
  has_many :company_users, class_name: "User", foreign_key: :company_profile_id, inverse_of: :shared_company_profile, dependent: :nullify
  has_many :jobs, dependent: :destroy
  has_many :conversations, dependent: :destroy
  has_many :messages, through: :conversations
  has_many :documents, as: :uploadable, dependent: :destroy
  has_many :ratings_received, -> { order(created_at: :desc) }, class_name: 'Rating', as: :reviewee, dependent: :destroy
  has_many :favorite_technician_entries, class_name: 'FavoriteTechnician', dependent: :destroy
  has_many :favorite_technician_profiles, through: :favorite_technician_entries, source: :technician_profile

  validates :membership_level, inclusion: { in: MembershipPolicy::LEVELS }

  def average_rating
    Rating.average_for(self)
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

  def sync_location_from_service_cities
    cities = Array(service_cities).map(&:to_s).map(&:strip).reject(&:blank?)
    self.location = cities.join(", ") if cities.any?
  end

  def normalize_membership_level
    self.membership_level = MembershipPolicy.normalized_level(membership_level)
  end
end
