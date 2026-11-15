# frozen_string_literal: true

# Stripe Charge IDs used as Transfer source_transaction.
# Card charges use ch_…; ACH / us_bank_account PaymentIntents often expose py_…
# (Payment-method Charge / "pay" object). PaymentIntent ids (pi_…) are never valid.
module StripeChargeId
  module_function

  def valid_shape?(id)
    s = id.to_s.strip
    return false if s.blank?
    return false if s.start_with?("pi_")

    s.start_with?("ch_", "py_")
  end

  # True when this id is recorded on a succeeded company collection for the job
  # (typically the Charge / py_ on that collection's PaymentIntent).
  def belongs_to_succeeded_collection?(charge_id, job)
    return false unless valid_shape?(charge_id)
    return false if job.blank?

    job.job_payment_transactions.company_collections.status_succeeded
      .where(stripe_charge_id: charge_id.to_s.strip)
      .exists?
  end

  # Prefer the newest succeeded collection's charge; reject if candidate is not that id
  # and not among the job's succeeded collection charges.
  def matches_job_succeeded_charge?(charge_id, job)
    return false unless valid_shape?(charge_id)
    return false if job.blank?

    ids = job.job_payment_transactions.company_collections.status_succeeded
      .order(id: :desc)
      .pluck(:stripe_charge_id)
      .map { |v| v.to_s.strip }
      .reject(&:blank?)
    return false if ids.empty?

    ids.include?(charge_id.to_s.strip)
  end
end
