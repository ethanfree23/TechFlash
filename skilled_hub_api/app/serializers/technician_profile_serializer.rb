class TechnicianProfileSerializer < ActiveModel::Serializer
  include ActiveStorageUrlHelper

  attributes :id, :trade_type, :experience_years, :availability, :bio, :phone, :location, :avatar_url, :stripe_connected, :user_id, :average_rating, :created_at, :updated_at,
             :address, :city, :state, :zip_code, :country, :latitude, :longitude, :specialties,
             :membership_level, :membership_fee_override_cents, :commission_override_percent, :membership_fee_waived,
             :membership_status, :membership_current_period_end_at, :effective_membership_fee_cents, :effective_commission_percent,
             :background_verified, :review_summary, :verification_badges

  belongs_to :user
  has_many :documents
  has_many :job_applications

  def avatar_url
    absolute_blob_url(object.avatar)
  end

  def stripe_connected
    object.stripe_account_id.present?
  end

  def effective_membership_fee_cents
    MembershipPolicy.technician_monthly_fee_cents(object)
  end

  def effective_commission_percent
    MembershipPolicy.technician_commission_percent(object)
  end
end 