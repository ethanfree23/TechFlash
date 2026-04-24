class TechnicianProfileDetailSerializer < ActiveModel::Serializer
  attributes :id, :trade_type, :experience_years, :availability, :bio, :location, :avatar_url, :user_id, :average_rating, :created_at, :updated_at,
             :address, :city, :state, :zip_code, :country,
             :membership_level, :membership_fee_override_cents, :commission_override_percent, :membership_fee_waived,
             :membership_status, :membership_current_period_end_at, :effective_membership_fee_cents, :effective_commission_percent

  belongs_to :user
  has_many :documents
  has_many :ratings_received, serializer: RatingSerializer

  def avatar_url
    return nil unless object.avatar.attached?
    Rails.application.routes.url_helpers.rails_blob_url(object.avatar)
  rescue StandardError
    nil
  end

  def effective_membership_fee_cents
    MembershipPolicy.technician_monthly_fee_cents(object)
  end

  def effective_commission_percent
    MembershipPolicy.technician_commission_percent(object)
  end
end
