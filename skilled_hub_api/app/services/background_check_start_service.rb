class BackgroundCheckStartService
  class Error < StandardError; end

  CHECKOUT_SUCCESS_PATH = "/settings?tab=profile&background_check=paid".freeze
  CHECKOUT_CANCEL_PATH = "/settings?tab=profile&background_check=cancel".freeze

  def self.launch_checkr_invitation!(background_check)
    new(background_check: background_check).launch_checkr_invitation!
  end

  def self.create_checkout_session!(background_check)
    new(background_check: background_check).create_checkout_session!
  end

  def initialize(background_check:)
    @background_check = background_check
    @user = background_check.user
  end

  def launch_checkr_invitation!
    client = CheckrClient.new
    raise Error, "Checkr is not configured." unless client.configured?

    candidate_id = reusable_candidate_id(client)
    unless candidate_id.present?
      candidate = client.create_candidate(
        user: @user,
        work_location: work_location_payload,
        custom_id: "techflash_user_#{@user.id}",
        zipcode: candidate_zipcode
      )
      candidate_id = candidate["id"]
    end

    invitation = client.create_invitation(
      candidate_id: candidate_id,
      package_name: @background_check.package_name,
      redirect_url: ENV["CHECKR_REDIRECT_URL"].presence || "#{frontend_base_url}/settings",
      work_location: work_location_payload,
      node_custom_id: @background_check.node_custom_id
    )
    @background_check.update!(
      provider_candidate_id: candidate_id,
      provider_invitation_id: invitation["id"],
      invitation_url: invitation["invitation_url"] || invitation["url"],
      provider_status: invitation["status"] || "invitation_sent",
      normalized_status: "invitation_sent",
      status: :invited,
      started_at: Time.current
    )

    VerificationProfile.for_user!(@user).update!(background_status: :pending)
    VerificationEventNotifier.background_check_started(@user, @background_check)
    invitation
  rescue CheckrClient::Error => e
    @background_check.update!(status: :failed, admin_notes: e.message)
    raise Error, e.message
  end

  def create_checkout_session!
    raise Error, "Payments not configured" if Stripe.api_key.blank?
    amount_cents = background_check_fee_cents
    raise Error, "Background check fee is invalid" if amount_cents <= 0

    customer_id = StripeCustomerService.ensure_customer_id!(@user)
    session = Stripe::Checkout::Session.create(
      mode: "payment",
      customer: customer_id,
      success_url: "#{frontend_base_url}#{CHECKOUT_SUCCESS_PATH}",
      cancel_url: "#{frontend_base_url}#{CHECKOUT_CANCEL_PATH}",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount_cents,
            product_data: {
              name: "TechFlash Background Check",
              description: "One-time verification processing fee"
            }
          }
        }
      ],
      metadata: {
        background_check_id: @background_check.id.to_s,
        user_id: @user.id.to_s
      }
    )
    @background_check.update!(
      payment_amount_cents: amount_cents,
      stripe_checkout_session_id: session.id,
      payment_status: :pending,
      status: :not_started
    )
    session
  rescue Stripe::StripeError => e
    raise Error, e.message
  end

  private

  def frontend_base_url
    ENV.fetch("FRONTEND_URL", "http://localhost:5173").to_s.chomp("/")
  end

  def background_check_fee_cents
    ENV.fetch("BACKGROUND_CHECK_FEE_CENTS", "4900").to_i
  end

  def work_location_payload
    {
      country: @background_check.work_location_country.presence || "US",
      state: @background_check.work_location_state.presence || "TX",
      city: @background_check.work_location_city.presence || "Houston"
    }
  end

  def candidate_zipcode
    @user.technician_profile&.zip_code.presence
  end

  def reusable_candidate_id(client)
    candidate_id = @background_check.provider_candidate_id.presence ||
      @user.background_checks.where.not(provider_candidate_id: nil).order(created_at: :desc).pick(:provider_candidate_id)
    return nil if candidate_id.blank?

    client.get_candidate(candidate_id: candidate_id)
    candidate_id
  rescue CheckrClient::Error
    nil
  end
end
