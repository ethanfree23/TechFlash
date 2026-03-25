class User < ApplicationRecord
  has_secure_password

  validates :email, presence: true, uniqueness: { case_sensitive: false }

  enum role: { technician: 0, company: 1, admin: 2 }

  has_one :technician_profile, dependent: :destroy
  has_one :company_profile, dependent: :destroy

  has_many :messages, foreign_key: :sender_id, dependent: :destroy
  has_many :ratings_given, class_name: 'Rating', foreign_key: :reviewer_id, dependent: :destroy
  has_many :ratings_received, class_name: 'Rating', foreign_key: :reviewee_id, dependent: :destroy
  has_many :feedback_submissions, dependent: :destroy
end
  