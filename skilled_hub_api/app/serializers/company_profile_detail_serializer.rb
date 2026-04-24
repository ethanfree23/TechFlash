class CompanyProfileDetailSerializer < ActiveModel::Serializer
  attributes :id, :company_name, :industry, :location, :bio, :avatar_url, :user_id, :average_rating, :created_at, :updated_at,
             :phone, :website_url, :facebook_url, :instagram_url, :linkedin_url, :service_cities, :company_users,
             :membership_level, :membership_fee_override_cents, :commission_override_percent, :membership_fee_waived,
             :membership_status, :membership_current_period_end_at, :effective_membership_fee_cents, :effective_commission_percent

  belongs_to :user
  has_many :ratings_received, serializer: RatingSerializer

  def avatar_url
    return nil unless object.avatar.attached?
    Rails.application.routes.url_helpers.rails_blob_url(object.avatar)
  rescue StandardError
    nil
  end

  def company_users
    User.where(role: :company, company_profile_id: object.id)
      .order(:email)
      .map do |u|
        {
          id: u.id,
          email: u.email,
          created_at: u.created_at
        }
      end
  end

  def effective_membership_fee_cents
    MembershipPolicy.company_monthly_fee_cents(object)
  end

  def effective_commission_percent
    MembershipPolicy.company_commission_percent(object)
  end
end
