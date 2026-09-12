class SmsDeliveryLog < ApplicationRecord
  belongs_to :user

  validates :category, presence: true
  validates :destination, presence: true

  def self.latest_ghl_opt_out_for(user_id)
    where(user_id: user_id, provider: "ghl", status: "skipped_opt_out")
      .order(created_at: :desc, id: :desc)
      .first
  end
end
