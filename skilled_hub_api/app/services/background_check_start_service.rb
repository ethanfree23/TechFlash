class BackgroundCheckStartService
  class Error < StandardError; end

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
    reused_candidate = candidate_id.present?
    candidate_id ||= create_candidate_for_checkr(client)

    invitation = create_invitation_for_checkr(client, candidate_id: candidate_id)
  rescue CheckrClient::Error => e
    # Some legacy/stale Checkr candidates can fail invitation creation with missing email.
    # When that happens for a reused candidate, rebuild candidate once and retry.
    if reused_candidate && invitation_retryable_for_email?(e.message)
      begin
        candidate_id = create_candidate_for_checkr(client)
        invitation = create_invitation_for_checkr(client, candidate_id: candidate_id)
      rescue CheckrClient::Error => retry_error
        @background_check.update!(status: :failed, admin_notes: retry_error.message)
        raise Error, retry_error.message
      end
    else
      @background_check.update!(status: :failed, admin_notes: e.message)
      raise Error, e.message
    end
  ensure
    if invitation.present?
      persist_invitation_state!(invitation: invitation, candidate_id: candidate_id)
      VerificationProfile.for_user!(@user).update!(background_status: :pending)
      VerificationEventNotifier.background_check_started(@user, @background_check)
    end
  end

  def create_checkout_session!
    raise Error, "Payments not configured" if Stripe.api_key.blank?
    amount_cents = background_check_fee_cents
    raise Error, "Background check fee is invalid" if amount_cents <= 0

    customer_id = StripeCustomerService.ensure_customer_id!(@user)
    session = Stripe::Checkout::Session.create(
      mode: "payment",
      customer: customer_id,
      success_url: "#{frontend_base_url}#{checkout_success_path}",
      cancel_url: "#{frontend_base_url}#{checkout_cancel_path}",
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

  def checkout_success_path
    "#{settings_base_path}?tab=profile&background_check=paid"
  end

  def checkout_cancel_path
    "#{settings_base_path}?tab=profile&background_check=cancel"
  end

  def settings_base_path
    "#{demo_frontend_prefix}/settings"
  end

  def demo_frontend_prefix
    return "/demo" if Rails.env.to_s == "demo" || ActiveModel::Type::Boolean.new.cast(ENV["DEMO_MODE"])

    ""
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

  def create_candidate_for_checkr(client)
    candidate = client.create_candidate(
      user: @user,
      work_location: work_location_payload,
      custom_id: "techflash_user_#{@user.id}",
      zipcode: candidate_zipcode
    )
    candidate["id"]
  end

  def create_invitation_for_checkr(client, candidate_id:)
    client.create_invitation(
      candidate_id: candidate_id,
      package_name: @background_check.package_name,
      redirect_url: ENV["CHECKR_REDIRECT_URL"].presence || "#{frontend_base_url}#{settings_base_path}",
      work_location: work_location_payload,
      node_custom_id: @background_check.node_custom_id
    )
  end

  def persist_invitation_state!(invitation:, candidate_id:)
    @background_check.update!(
      provider_candidate_id: candidate_id,
      provider_invitation_id: invitation["id"],
      invitation_url: invitation["invitation_url"] || invitation["url"],
      provider_status: invitation["status"] || "invitation_sent",
      normalized_status: "invitation_sent",
      status: :invited,
      started_at: Time.current
    )
  end

  def invitation_retryable_for_email?(message)
    message.to_s.match?(/email is missing/i)
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
