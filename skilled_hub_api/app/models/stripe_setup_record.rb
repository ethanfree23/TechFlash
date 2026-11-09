# frozen_string_literal: true

# Audit/reconciliation record for company SetupIntents (card + ACH).
# Never stores raw bank/card numbers — only Stripe IDs and status.
class StripeSetupRecord < ApplicationRecord
  belongs_to :user

  STATUSES = %w[requires_action processing succeeded failed canceled].freeze

  validates :stripe_setup_intent_id, presence: true, uniqueness: true
  validates :status, inclusion: { in: STATUSES }

  def self.upsert_from_setup_intent!(setup_intent, user: nil)
    customer_id = setup_intent.customer.to_s.presence
    resolved_user = user
    resolved_user ||= User.find_by(stripe_customer_id: customer_id) if customer_id
    return nil if resolved_user.blank?

    rec = StripeSetupRecord.lock.find_or_initialize_by(stripe_setup_intent_id: setup_intent.id)
    # Do not overwrite a newer successful setup with an older failure.
    if rec.persisted? && rec.status == "succeeded" && setup_intent.status.to_s != "succeeded"
      Rails.logger.info("[stripe_setup] ignoring #{setup_intent.status} after succeeded id=#{setup_intent.id}")
      return rec
    end

    attrs = {
      user: resolved_user,
      stripe_customer_id: customer_id,
      stripe_payment_method_id: setup_intent.payment_method.to_s.presence,
      payment_method_type: setup_intent["payment_method_types"]&.first ||
        setup_intent.try(:payment_method_types)&.first,
      status: normalize_status(setup_intent.status),
      metadata_json: rec.metadata_json.to_h.merge(
        "last_event_status" => setup_intent.status.to_s,
        "updated_at" => Time.current.iso8601
      )
    }

    case setup_intent.status.to_s
    when "succeeded"
      attrs[:succeeded_at] = Time.current
      attrs[:error_message] = nil
    when "canceled"
      attrs[:failed_at] ||= Time.current
      attrs[:error_message] = "Setup canceled"
    when "requires_payment_method"
      # setup_failed path often leaves SI in requires_payment_method
      attrs[:status] = "failed"
      attrs[:failed_at] = Time.current
      attrs[:error_message] = setup_intent.last_setup_error&.message || "Setup failed"
    end

    if setup_intent.last_setup_error.present?
      attrs[:error_message] = setup_intent.last_setup_error.message
      attrs[:status] = "failed" unless attrs[:status] == "succeeded"
      attrs[:failed_at] ||= Time.current
    end

    rec.assign_attributes(attrs)
    rec.save!
    rec
  end

  def self.normalize_status(status)
    case status.to_s
    when "succeeded" then "succeeded"
    when "canceled" then "canceled"
    when "processing" then "processing"
    when "requires_action", "requires_confirmation", "requires_payment_method" then "requires_action"
    else
      status.to_s.presence || "requires_action"
    end
  end
end
