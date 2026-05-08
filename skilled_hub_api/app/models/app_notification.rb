class AppNotification < ApplicationRecord
  belongs_to :user

  validates :category, presence: true
  validates :title, presence: true
end
