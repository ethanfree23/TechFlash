# frozen_string_literal: true

# Resolves Stripe Customer IDs stored on User when switching Stripe mode (e.g. test → live):
# old cus_... values are invalid in the new environment; we clear and recreate.
class StripeCustomerService
  # Returns existing id if valid; clears DB and returns nil if Stripe has no such customer.
  def self.validate_or_clear_customer_id!(user)
    id = user.stripe_customer_id
    return nil if id.blank?

    begin
      Stripe::Customer.retrieve(id)
      id
    rescue Stripe::InvalidRequestError => e
      raise e unless no_such_customer?(e)

      user.update!(stripe_customer_id: nil)
      nil
    end
  end

  # Ensures user has a Stripe Customer (creates one if missing or after stale id was cleared).
  def self.ensure_customer_id!(user)
    id = validate_or_clear_customer_id!(user)
    return id if id.present?

    customer = Stripe::Customer.create(email: user.email)
    user.update!(stripe_customer_id: customer.id)
    customer.id
  end

  def self.no_such_customer?(e)
    return false unless e.is_a?(Stripe::InvalidRequestError)

    e.message.to_s.include?('No such customer') || e.code.to_s == 'resource_missing'
  end
end
