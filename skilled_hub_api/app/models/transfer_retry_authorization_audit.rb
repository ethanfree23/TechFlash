# frozen_string_literal: true

# Append-only audit of transfer retry authorization grant/consume/refuse outcomes.
# Rows are never updated or deleted by application code.
class TransferRetryAuthorizationAudit < ApplicationRecord
  belongs_to :job_payment_transaction, optional: true
  belongs_to :transfer_retry_authorization, optional: true

  validates :event, presence: true

  before_destroy { raise ActiveRecord::ReadOnlyRecord, "transfer retry audits are immutable" }

  def readonly?
    !new_record?
  end
end
