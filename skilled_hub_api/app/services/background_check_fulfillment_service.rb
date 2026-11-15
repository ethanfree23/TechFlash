# frozen_string_literal: true

# Creates the Checkr invitation for a background check whose payment has already been collected.
#
# Payment collection (BackgroundCheck#payment_status => paid) and fulfillment (provider_invitation_id
# present) are tracked independently so that a failed Checkr call can be retried — by Stripe
# re-delivering the webhook, by `rake verification:retry_background_check_invitations`, or by any
# other caller — without re-charging or issuing a second invitation.
class BackgroundCheckFulfillmentService
  class Error < StandardError; end

  # Paid checks that still need an invitation. Status is intentionally not consulted beyond
  # excluding checks an admin already decided on: a check left `failed` by an earlier Checkr
  # error is exactly what this service exists to retry.
  def self.awaiting_invitation
    BackgroundCheck
      .where(payment_status: :paid, provider_invitation_id: nil)
      .where(status: %i[not_started failed])
  end

  # Returns :launched, :already_fulfilled, or :not_eligible. Raises Error when Checkr fails;
  # the check is left paid and without an invitation (retryable).
  #
  # The row lock is held across the Checkr call on purpose: BackgroundCheckStartService has no
  # provider-side idempotency key, so the lock is what guarantees concurrent retries cannot both
  # create an invitation for the same check.
  def self.ensure_invitation!(background_check_id)
    outcome = :not_eligible
    BackgroundCheck.transaction do
      check = BackgroundCheck.lock.find_by(id: background_check_id)
      next if check.blank? || !check.payment_status_paid?

      if check.provider_invitation_id.present?
        outcome = :already_fulfilled
        next
      end

      invitation = BackgroundCheckStartService.launch_checkr_invitation!(check)
      # launch_checkr_invitation! persists provider_invitation_id itself; this only covers a
      # provider response whose id arrived without the service recording it.
      check.update!(provider_invitation_id: invitation["id"]) if invitation["id"].present? && check.reload.provider_invitation_id.blank?
      outcome = :launched
    end
    outcome
  rescue BackgroundCheckStartService::Error => e
    # The rolled-back transaction discarded the service's own bookkeeping; re-record it for admins.
    # payment_status stays paid and provider_invitation_id stays nil, so the check remains
    # in awaiting_invitation and the next attempt retries it.
    BackgroundCheck.where(id: background_check_id).update_all(
      status: BackgroundCheck.statuses[:failed],
      admin_notes: "Checkr invitation failed (will retry): #{e.message}",
      updated_at: Time.current
    )
    raise Error, e.message
  end
end
