# frozen_string_literal: true

class JobIssueReport < ApplicationRecord
  belongs_to :job
  belongs_to :user

  validates :body, presence: true
end
