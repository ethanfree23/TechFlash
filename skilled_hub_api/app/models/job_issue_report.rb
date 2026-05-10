# frozen_string_literal: true

class JobIssueReport < ApplicationRecord
  include ContentSafetyValidations

  belongs_to :job
  belongs_to :user

  validates :body, presence: true
  validates_safe_text :body, max_length: 2_000
end
