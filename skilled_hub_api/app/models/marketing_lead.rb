class MarketingLead < ApplicationRecord
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :email, uniqueness: { case_sensitive: false }

  before_validation :normalize_fields

  private

  def normalize_fields
    self.email = email.to_s.strip.downcase
    self.role_view = role_view.to_s.strip.downcase.presence || "technician"
    self.source = source.to_s.strip.presence || "landing_page"
  end
end
