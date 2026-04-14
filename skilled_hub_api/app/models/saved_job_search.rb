# frozen_string_literal: true

class SavedJobSearch < ApplicationRecord
  belongs_to :technician_profile

  before_validation :normalize_fields

  validates :technician_profile_id, presence: true

  private

  def normalize_fields
    self.keyword = keyword.to_s.strip.presence
    self.location = location.to_s.strip.presence
    self.skill_class = skill_class.to_s.strip.presence
  end
end
