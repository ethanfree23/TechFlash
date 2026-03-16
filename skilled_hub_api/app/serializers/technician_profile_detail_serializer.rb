class TechnicianProfileDetailSerializer < ActiveModel::Serializer
  attributes :id, :trade_type, :experience_years, :availability, :bio, :location, :avatar_url, :user_id, :average_rating, :created_at, :updated_at,
             :address, :city, :state, :zip_code, :country

  belongs_to :user
  has_many :documents
  has_many :ratings_received, serializer: RatingSerializer

  def avatar_url
    return nil unless object.avatar.attached?
    Rails.application.routes.url_helpers.rails_blob_url(object.avatar)
  rescue StandardError
    nil
  end
end
