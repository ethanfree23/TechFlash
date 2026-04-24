class User < ApplicationRecord
  PASSWORD_RESET_EXPIRY = 72.hours

  has_secure_password

  validates :email, presence: true, uniqueness: { case_sensitive: false }

  enum role: { technician: 0, company: 1, admin: 2 }

  # Temporary password when an admin provisions an account (has_secure_password min length 6).
  def self.initial_password_from_email(email)
    e = email.to_s.strip
    raise ArgumentError, 'email required' if e.blank?

    e.length >= 6 ? e : "#{e}!TF26"
  end

  def generate_password_reset_token!
    self.password_reset_token = SecureRandom.urlsafe_base64(32)
    self.password_reset_sent_at = Time.current
    save!(validate: false)
  end

  def clear_password_reset_token!
    update_columns(password_reset_token: nil, password_reset_sent_at: nil, updated_at: Time.current)
  end

  def password_reset_token_active?
    password_reset_token.present? &&
      password_reset_sent_at.present? &&
      password_reset_sent_at > PASSWORD_RESET_EXPIRY.ago
  end

  has_one :technician_profile, dependent: :destroy
  has_one :company_profile, foreign_key: :user_id, inverse_of: :user, dependent: :destroy
  belongs_to :shared_company_profile, class_name: "CompanyProfile", foreign_key: :company_profile_id, optional: true, inverse_of: :company_users

  has_many :messages, foreign_key: :sender_id, dependent: :destroy
  has_many :ratings_given, class_name: 'Rating', foreign_key: :reviewer_id, dependent: :destroy
  has_many :ratings_received, class_name: 'Rating', foreign_key: :reviewee_id, dependent: :destroy
  has_many :feedback_submissions, dependent: :destroy
  has_many :crm_leads, foreign_key: :linked_user_id, dependent: :nullify, inverse_of: :linked_user
  has_many :user_login_events, dependent: :delete_all
  has_many :job_issue_reports, dependent: :destroy
  has_many :sent_referrals, class_name: "ReferralSubmission", foreign_key: :referrer_user_id, dependent: :destroy, inverse_of: :referrer_user
  has_many :received_referrals, class_name: "ReferralSubmission", foreign_key: :referred_user_id, dependent: :nullify, inverse_of: :referred_user

  def company_profile
    shared_company_profile || super
  end
end
