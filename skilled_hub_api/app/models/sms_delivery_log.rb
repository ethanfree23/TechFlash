class SmsDeliveryLog < ApplicationRecord
  belongs_to :user

  validates :category, presence: true
  validates :destination, presence: true
end
