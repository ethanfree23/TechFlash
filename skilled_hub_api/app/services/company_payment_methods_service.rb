# frozen_string_literal: true

# Lists, saves, and manages company Stripe payment methods (card + ACH/us_bank_account).
# Never stores raw bank/card numbers — only Stripe PaymentMethod IDs and display metadata.
class CompanyPaymentMethodsService
  class Error < StandardError; end

  SUPPORTED_TYPES = %w[card us_bank_account].freeze

  def self.list_for(user)
    customer_id = StripeCustomerService.validate_or_clear_customer_id!(user)
    ach_status = AchAccess.status_for(user.company_profile)
    if customer_id.blank?
      return {
        payment_methods: [],
        default_payment_method_id: nil
      }.merge(ach_status)
    end

    customer = Stripe::Customer.retrieve(customer_id, expand: ["invoice_settings.default_payment_method"])
    default_id = customer.invoice_settings&.default_payment_method
    default_id = default_id.id if default_id.respond_to?(:id)

    methods = SUPPORTED_TYPES.flat_map do |type|
      Stripe::PaymentMethod.list(customer: customer_id, type: type, limit: 100).data.map { |pm| serialize(pm, default_id) }
    end

    {
      payment_methods: methods,
      default_payment_method_id: default_id
    }.merge(ach_status)
  rescue Stripe::StripeError => e
    raise Error, e.message
  end

  def self.create_setup_intent!(user, payment_method_type:, ip_address: nil, user_agent: nil)
    type = payment_method_type.to_s
    raise Error, "Unsupported payment method type" unless SUPPORTED_TYPES.include?(type)

    if type == "us_bank_account"
      AchAccess.assert_allowed!(user.company_profile)
    end

    customer_id = StripeCustomerService.ensure_customer_id!(user)
    params = {
      customer: customer_id,
      payment_method_types: [type],
      usage: "off_session"
    }

    if type == "us_bank_account"
      params[:payment_method_options] = {
        us_bank_account: {
          financial_connections: {
            permissions: ["payment_method"]
          },
          verification_method: "automatic"
        }
      }
      # Do NOT pass mandate_data on an unconfirmed SetupIntent — Stripe rejects it.
      # Mandate acceptance is collected client-side via confirmUsBankAccountSetup /
      # collectBankAccountForSetup (ip_address/user_agent retained for audit logging only).
      if ip_address.present? || user_agent.present?
        params[:metadata] = {
          techflash_setup: "company_us_bank_account",
          request_ip_present: ip_address.present?.to_s,
          user_agent_present: user_agent.present?.to_s
        }
      end
    end

    intent = Stripe::SetupIntent.create(params)
    {
      client_secret: intent.client_secret,
      setup_intent_id: intent.id,
      payment_method_type: type
    }
  rescue AchAccess::DisabledError => e
    raise Error, e.message
  rescue Stripe::StripeError => e
    raise Error, e.message
  end

  def self.set_default!(user, payment_method_id:)
    raise Error, "payment_method_id required" if payment_method_id.blank?

    customer_id = StripeCustomerService.ensure_customer_id!(user)
    pm = Stripe::PaymentMethod.retrieve(payment_method_id)
    unless pm.customer.to_s == customer_id.to_s
      raise Error, "Payment method does not belong to this company"
    end
    unless SUPPORTED_TYPES.include?(pm.type.to_s)
      raise Error, "Unsupported payment method type"
    end
    if pm.type.to_s == "us_bank_account"
      AchAccess.assert_allowed!(user.company_profile)
    end

    Stripe::Customer.update(
      customer_id,
      invoice_settings: { default_payment_method: payment_method_id }
    )
    serialize(pm, payment_method_id)
  rescue AchAccess::DisabledError => e
    raise Error, e.message
  rescue Stripe::StripeError => e
    raise Error, e.message
  end

  def self.detach!(user, payment_method_id:)
    raise Error, "payment_method_id required" if payment_method_id.blank?

    customer_id = StripeCustomerService.validate_or_clear_customer_id!(user)
    raise Error, "No Stripe customer" if customer_id.blank?

    pm = Stripe::PaymentMethod.retrieve(payment_method_id)
    unless pm.customer.to_s == customer_id.to_s
      raise Error, "Payment method does not belong to this company"
    end

    customer = Stripe::Customer.retrieve(customer_id, expand: ["invoice_settings.default_payment_method"])
    default_id = customer.invoice_settings&.default_payment_method
    default_id = default_id.id if default_id.respond_to?(:id)
    was_default = default_id.to_s == payment_method_id.to_s

    Stripe::PaymentMethod.detach(payment_method_id)

    if was_default
      replacement = next_payment_method_id(customer_id, exclude_id: payment_method_id)
      Stripe::Customer.update(
        customer_id,
        invoice_settings: { default_payment_method: replacement }
      )
    end

    { detached: true, payment_method_id: payment_method_id, new_default_payment_method_id: was_default ? next_payment_method_id(customer_id) : default_id }
  rescue Stripe::StripeError => e
    raise Error, e.message
  end

  def self.serialize(pm, default_id = nil)
    base = {
      id: pm.id,
      type: pm.type,
      created: pm.created,
      is_default: default_id.present? && default_id.to_s == pm.id.to_s
    }

    case pm.type.to_s
    when "card"
      card = pm.card
      base.merge(
        brand: card&.brand,
        last4: card&.last4,
        exp_month: card&.exp_month,
        exp_year: card&.exp_year,
        display_name: card_display_name(card)
      )
    when "us_bank_account"
      bank = pm.us_bank_account
      base.merge(
        bank_name: bank&.bank_name,
        last4: bank&.last4,
        account_type: bank&.account_type,
        account_holder_type: bank&.account_holder_type,
        routing_number_last4: bank&.routing_number, # Stripe returns masked / last4-style routing display
        status: bank&.status_details&.blocked.present? ? "blocked" : (bank&.networks&.preferred || "verified"),
        display_name: bank_display_name(bank)
      )
    else
      base.merge(display_name: pm.type.to_s.humanize)
    end
  end

  def self.card_display_name(card)
    return "Card" if card.blank?

    brand = card.brand.to_s.capitalize
    "#{brand} •••• #{card.last4}"
  end

  def self.bank_display_name(bank)
    return "Bank account" if bank.blank?

    name = bank.bank_name.presence || "Bank account"
    type = bank.account_type.to_s.presence
    suffix = bank.last4.present? ? "•••• #{bank.last4}" : nil
    [name, type&.capitalize, suffix].compact.join(" · ")
  end

  def self.next_payment_method_id(customer_id, exclude_id: nil)
    SUPPORTED_TYPES.each do |type|
      list = Stripe::PaymentMethod.list(customer: customer_id, type: type, limit: 10).data
      pm = list.find { |m| m.id.to_s != exclude_id.to_s }
      return pm.id if pm
    end
    nil
  end
  private_class_method :next_payment_method_id
end
