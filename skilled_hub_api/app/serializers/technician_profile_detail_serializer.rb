class TechnicianProfileDetailSerializer < ActiveModel::Serializer
  include ActiveStorageUrlHelper

  attributes :id, :trade_type, :skill_class, :experience_years, :availability, :bio, :location, :avatar_url, :user_id, :average_rating, :created_at, :updated_at,
             :address, :city, :state, :zip_code, :country, :specialties, :trade_qualifications,
             :membership_level, :membership_fee_override_cents, :commission_override_percent, :membership_fee_waived,
             :membership_status, :membership_current_period_end_at, :effective_membership_fee_cents, :effective_commission_percent,
             :background_verified, :review_summary, :verification_badges

  # Full knowledge assessment results including category breakdown, visible to
  # the owning technician, companies and admins.
  attribute :assessment_results, if: :assessment_results_visible?

  belongs_to :user
  has_many :documents
  has_many :ratings_received, serializer: RatingSerializer

  def avatar_url
    absolute_blob_url(object.avatar)
  end

  def effective_membership_fee_cents
    MembershipPolicy.technician_monthly_fee_cents(object)
  end

  def effective_commission_percent
    MembershipPolicy.technician_commission_percent(object)
  end

  def trade_qualifications
    object.effective_trade_qualifications.as_json
  end

  def assessment_results
    assessment_results_presenter.payload(include_categories: true)
  end

  def assessment_results_visible?
    assessment_results_presenter.visible?
  end

  private

  def assessment_results_presenter
    @assessment_results_presenter ||= Assessments::ProfileResultsPresenter.new(
      technician_profile: object,
      viewer: scope
    )
  end
end
