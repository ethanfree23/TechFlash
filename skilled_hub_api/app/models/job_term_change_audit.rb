# frozen_string_literal: true

class JobTermChangeAudit < ApplicationRecord
  belongs_to :job
  belongs_to :actor_user, class_name: "User"

  validates :change_type, presence: true
end
