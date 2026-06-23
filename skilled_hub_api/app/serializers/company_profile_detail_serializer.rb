class CompanyProfileDetailSerializer < ActiveModel::Serializer
  include ActiveStorageUrlHelper

  attributes :id, :company_name, :industry, :location, :bio, :avatar_url, :user_id, :average_rating, :created_at, :updated_at,
             :phone, :website_url, :facebook_url, :instagram_url, :linkedin_url, :service_cities, :company_users,
             :state, :electrical_license_number,
             :membership_level, :membership_fee_override_cents, :commission_override_percent, :membership_fee_waived,
             :membership_status, :membership_current_period_end_at, :effective_membership_fee_cents, :effective_commission_percent,
             :review_summary

  belongs_to :user
  has_many :ratings_received, serializer: RatingSerializer

  def avatar_url
    absolute_blob_url(object.avatar)
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
