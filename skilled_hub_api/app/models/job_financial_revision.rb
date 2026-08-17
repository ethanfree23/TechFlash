# frozen_string_literal: true

class JobFinancialRevision < ApplicationRecord
  belongs_to :job
  belongs_to :job_payment_transaction, optional: true

  validates :revision_number, presence: true
  validates :source, presence: true
end
