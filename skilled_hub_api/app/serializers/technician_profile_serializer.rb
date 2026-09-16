class TechnicianProfileSerializer < ActiveModel::Serializer
  include ActiveStorageUrlHelper

  attributes :id, :trade_type, :skill_class, :experience_years, :availability, :bio, :phone, :location, :avatar_url, :stripe_connected, :stripe_payout_ready, :user_id, :average_rating, :created_at, :updated_at,
             :address, :city, :state, :zip_code, :country, :latitude, :longitude, :place_id,
             :geocode_status, :geocoded_at, :specialties, :trade_qualifications,
             :membership_level, :membership_fee_override_cents, :commission_override_percent, :membership_fee_waived,
             :membership_status, :membership_current_period_end_at, :effective_membership_fee_cents, :effective_commission_percent,
             :background_verified, :review_summary, :verification_badges

  # Knowledge assessment results, visible to the owning technician, companies
  # and admins. Omitted entirely for other viewers rather than rendered empty.
  attribute :assessment_results, if: :assessment_results_visible?

  belongs_to :user
  has_many :documents
  has_many :job_applications

  def avatar_url
    absolute_blob_url(object.avatar)
  end

  def stripe_connected
    object.stripe_account_id.present?
  end

  def stripe_payout_ready
    StripeConnectAccountService.payout_ready?(object)
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
    assessment_results_presenter.payload(include_categories: false)
  end

  def assessment_results_visible?
    assessment_results_presenter.visible?
  end

  private

  # List/card contexts omit category scores to keep directory payloads small;
  # the detail serializer includes them.
  def assessment_results_presenter
    @assessment_results_presenter ||= Assessments::ProfileResultsPresenter.new(
      technician_profile: object,
      viewer: scope
    )
  end
end 