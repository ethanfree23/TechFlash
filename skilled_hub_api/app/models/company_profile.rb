class CompanyProfile < ApplicationRecord
  has_one_attached :avatar

  belongs_to :user
  has_many :jobs, dependent: :destroy
  has_many :conversations, dependent: :destroy
  has_many :messages, through: :conversations
  has_many :documents, as: :uploadable, dependent: :destroy
  has_many :ratings_received, -> { order(created_at: :desc) }, class_name: 'Rating', as: :reviewee, dependent: :destroy
  has_many :favorite_technician_entries, class_name: 'FavoriteTechnician', dependent: :destroy
  has_many :favorite_technician_profiles, through: :favorite_technician_entries, source: :technician_profile

  def average_rating
    Rating.average_for(self)
  end
end
