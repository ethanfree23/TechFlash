class Job < ApplicationRecord
  enum status: { open: 0, reserved: 1, accepted: 2, completed: 3, filled: 4, finished: 5 }

  belongs_to :company_profile

  has_many :job_applications, dependent: :destroy
  has_many :conversations, dependent: :destroy
  has_many :ratings, dependent: :destroy

  # Auto-complete jobs past their scheduled end time
  def self.auto_complete_expired!
    where(status: :reserved)
      .where('scheduled_end_at IS NOT NULL AND scheduled_end_at <= ?', Time.current)
      .update_all(status: Job.statuses[:finished], finished_at: Time.current)
  end
end
