# frozen_string_literal: true

# Allocates a refund across succeeded company PaymentIntents (newest first).
class JobRefundAllocator
  Slice = Struct.new(:payment_intent_id, :amount_cents, keyword_init: true)
  Result = Struct.new(:success, :slices, :error, keyword_init: true)

  COLLECTION_TYPES = %w[initial_job_charge counteroffer_top_up final_hours_top_up].freeze
  REFUND_TYPES = %w[counteroffer_refund final_hours_refund refund].freeze

  def self.allocate(job:, amount_cents:)
    new(job: job, amount_cents: amount_cents).allocate
  end

  def initialize(job:, amount_cents:)
    @job = job
    @amount_cents = amount_cents.to_i
  end

  def allocate
    return Result.new(success: true, slices: []) if @amount_cents <= 0
    if @amount_cents > remaining_total
      return Result.new(
        success: false,
        slices: [],
        error: "Refund of #{@amount_cents} cents exceeds remaining collected balance of #{remaining_total} cents."
      )
    end

    remaining_to_allocate = @amount_cents
    slices = []
    remaining_by_pi.each do |pi_id, available|
      break if remaining_to_allocate <= 0
      next if available <= 0

      take = [available, remaining_to_allocate].min
      slices << Slice.new(payment_intent_id: pi_id, amount_cents: take)
      remaining_to_allocate -= take
    end

    if remaining_to_allocate.positive?
      return Result.new(
        success: false,
        slices: [],
        error: "Could not allocate refund across collected PaymentIntents (#{remaining_to_allocate} cents unallocated)."
      )
    end

    Result.new(success: true, slices: slices)
  end

  def remaining_total
    remaining_by_pi.values.sum
  end

  def remaining_by_pi
    collected = @job.job_payment_transactions.status_succeeded
      .where(transaction_type: COLLECTION_TYPES)
      .where.not(stripe_payment_intent_id: [nil, ""])
      .order(id: :desc)

    refunded_by_pi = @job.job_payment_transactions.status_succeeded
      .where(transaction_type: REFUND_TYPES)
      .where.not(stripe_payment_intent_id: [nil, ""])
      .group(:stripe_payment_intent_id)
      .sum(:amount_cents)

    collected_by_pi = {}
    collected.each do |txn|
      pi_id = txn.stripe_payment_intent_id
      collected_by_pi[pi_id] = collected_by_pi[pi_id].to_i + txn.amount_cents.to_i
    end

    collected_by_pi.each_with_object({}) do |(pi_id, collected_cents), acc|
      acc[pi_id] = [collected_cents - refunded_by_pi[pi_id].to_i, 0].max
    end
  end
end
