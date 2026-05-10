class User < ApplicationRecord
  PASSWORD_RESET_EXPIRY = 72.hours
  EMAIL_NOTIFICATION_CATEGORIES = %w[messages job_lifecycle reviews membership_updates].freeze

  has_secure_password
  attr_accessor :password_set_actor

  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :phone, presence: true, if: :admin?, on: :update
  before_save :stamp_password_metadata, if: :will_save_change_to_password_digest?

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
  has_many :email_delivery_logs, dependent: :delete_all
  has_many :job_issue_reports, dependent: :destroy
  has_one :job_alert_preference, dependent: :destroy
  has_many :app_notifications, dependent: :destroy
  has_many :sms_delivery_logs, dependent: :destroy
  has_many :sent_referrals, class_name: "ReferralSubmission", foreign_key: :referrer_user_id, dependent: :destroy, inverse_of: :referrer_user
  has_many :received_referrals, class_name: "ReferralSubmission", foreign_key: :referred_user_id, dependent: :nullify, inverse_of: :referred_user

  def company_profile
    shared_company_profile || super
  end

  def email_notifications_enabled?
    self[:email_notifications_enabled] != false
  end

  def email_notification_preferences_hash
    raw = self[:email_notification_preferences]
    parsed =
      case raw
      when Hash
        raw
      else
        JSON.parse(raw.to_s)
      end
    normalized = default_email_notification_preferences.merge(parsed.stringify_keys)
    normalized.transform_values { |v| ActiveModel::Type::Boolean.new.cast(v) }
  rescue JSON::ParserError
    default_email_notification_preferences
  end

  def email_notification_enabled_for?(category)
    key = category.to_s
    return true unless EMAIL_NOTIFICATION_CATEGORIES.include?(key)

    email_notification_preferences_hash[key] != false
  end

  # This preference is reserved for future saved-search/new-job digest sends.
  def job_alert_notifications_enabled?
    self[:job_alert_notifications_enabled] != false
  end

  def ui_preferences_hash
    raw = self[:ui_preferences]
    h =
      case raw
      when Hash
        raw
      when nil
        {}
      else
        JSON.parse(raw.to_s)
      end
    h.is_a?(Hash) ? h.deep_stringify_keys : {}
  rescue JSON::ParserError
    {}
  end

  def blocked_user_ids
    Array(ui_preferences_hash["blocked_user_ids"]).map(&:to_i).uniq
  end

  def blocked_user?(other_user_id)
    blocked_user_ids.include?(other_user_id.to_i)
  end

  def update_blocked_user_ids!(ids)
    cleaned = Array(ids).map(&:to_i).reject(&:zero?).uniq
    merged = ui_preferences_hash.deep_merge("blocked_user_ids" => cleaned)
    update_columns(ui_preferences: merged, updated_at: Time.current)
  end

  private

  def default_email_notification_preferences
    {
      "messages" => true,
      "job_lifecycle" => true,
      "reviews" => true,
      "membership_updates" => true
    }
  end

  def stamp_password_metadata
    actor = password_set_actor.to_s.presence
    actor = "user" unless %w[admin user].include?(actor)
    self.password_set_by = actor
    self.password_set_at = Time.current
  end
end
