# frozen_string_literal: true

class FavoriteTechnician < ApplicationRecord
  belongs_to :company_profile
  belongs_to :technician_profile

  validates :technician_profile_id, uniqueness: { scope: :company_profile_id }
end
