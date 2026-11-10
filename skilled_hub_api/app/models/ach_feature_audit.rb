# frozen_string_literal: true

class AchFeatureAudit < ApplicationRecord
  belongs_to :company_profile, optional: true
  belongs_to :actor_user, class_name: "User", optional: true, foreign_key: :actor_user_id

  SCOPES = %w[global company].freeze

  validates :scope, inclusion: { in: SCOPES }
  validates :new_value, inclusion: { in: [true, false] }
end
