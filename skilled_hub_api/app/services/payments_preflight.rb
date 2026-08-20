# frozen_string_literal: true

# Read-only go/no-go check before a live job payment.
# Never creates a Job, PaymentIntent, Customer, PaymentMethod, Transfer, Refund,
# or any other Stripe resource. Never writes to the database.
class PaymentsPreflight
  def self.run(job_id: nil, company_email: nil, technician_email: nil, labor_cents: nil)
    new(
      job_id: job_id,
      company_email: company_email,
      technician_email: technician_email,
      labor_cents: labor_cents
    ).run
  end

  def initialize(job_id: nil, company_email: nil, technician_email: nil, labor_cents: nil)
    @job_id = job_id.presence
    @company_email = company_email.presence
    @technician_email = technician_email.presence
    @labor_cents_raw = labor_cents
    @blockers = []
    @notes = []
    @lines = []
  end

  def ready?
    @blockers.empty?
  end

  def run
    job = resolve_job
    proposed_labor = parse_labor_cents
    company_user, company_profile = resolve_company(job)
    technician_user, technician_profile = resolve_technician(job)

    if job.blank? && @job_id.blank?
      if company_profile.blank?
        block("COMPANY_EMAIL is required when JOB_ID is not set")
      end
      if proposed_labor.nil?
        block("LABOR_CENTS is required when JOB_ID is not set (example: LABOR_CENTS=1000 for $10.00)")
      end
    end
    if job.present? && proposed_labor
      note("LABOR_CENTS ignored because JOB_ID was provided; using the job's stored labor")
    end

    print_company(company_user, company_profile)
    if job
      print_existing_job(job, company_profile)
      print_technician(technician_user, technician_profile, job: job, labor_cents: nil)
      print_expected_settlement(job)
    else
      print_proposed_job(company_profile, proposed_labor)
      print_technician(technician_user, technician_profile, job: nil, labor_cents: proposed_labor)
    end
    print_stripe_mode
    print_verdict

    self
  end

  def to_s
    @lines.join("\n")
  end

  private

  def line(text = "")
    @lines << text
  end

  def resolve_job
    return nil if @job_id.blank?

    job = Job.find_by(id: @job_id)
    block("JOB_ID=#{@job_id} was not found") if job.blank?
    job
  end

  def parse_labor_cents
    return nil if @labor_cents_raw.nil? || @labor_cents_raw.to_s.strip == ""

    value = Integer(@labor_cents_raw)
    if value <= 0
      block("LABOR_CENTS must be a positive integer (cents)")
      return nil
    end
    value
  rescue ArgumentError, TypeError
    block("LABOR_CENTS=#{@labor_cents_raw.inspect} is not a valid integer")
    nil
  end

  def resolve_company(job)
    if job
      profile = job.company_profile
      return [profile&.user, profile]
    end
    return [nil, nil] if @company_email.blank?

    user = User.find_by(email: @company_email)
    if user.blank?
      block("COMPANY_EMAIL=#{@company_email} was not found")
      return [nil, nil]
    end
    if user.company_profile.blank?
      block("COMPANY_EMAIL=#{@company_email} has no company profile")
    end
    [user, user.company_profile]
  end

  def resolve_technician(job)
    if job
      app = job.job_applications.find_by(status: :accepted)
      profile = app&.technician_profile
      return [profile&.user, profile]
    end
    return [nil, nil] if @technician_email.blank?

    user = User.find_by(email: @technician_email)
    if user.blank?
      block("TECHNICIAN_EMAIL=#{@technician_email} was not found")
      return [nil, nil]
    end
    if user.technician_profile.blank?
      block("TECHNICIAN_EMAIL=#{@technician_email} has no technician profile")
    end
    [user, user.technician_profile]
  end

  def print_company(user, profile)
    line("COMPANY")
    if profile.blank?
      line("  (none resolved — pass JOB_ID or COMPANY_EMAIL)")
      line
      return
    end

    tier = MembershipTierConfig.find_by(audience: "company", slug: profile.membership_level)
    coupon = CouponApplicationService.resolve_active_assignment(user: user)
    chart_percent = tier&.commission_percent
    effective = MembershipPolicy.company_commission_percent(profile)
    customer_present = user&.stripe_customer_id.present?
    pm_present = payment_method_present?(user)

    line("  membership tier: #{profile.membership_level}")
    line("  membership_status: #{profile.membership_status.presence || "(none)"}")
    line("  commission chart %: #{chart_percent.nil? ? "(missing tier config)" : "#{chart_percent}"}")
    line("  commission override: #{profile.commission_override_percent.nil? ? "(none)" : profile.commission_override_percent}")
    line("  effective company commission %: #{effective}")
    line("  coupon: #{coupon ? "#{coupon.coupon&.code} (#{coupon.status})" : "(none)"}")
    line("  Stripe customer exists: #{customer_present}")
    line("  usable payment method exists: #{pm_present}")
    line("  membership_fee_waived: #{profile.membership_fee_waived} (monthly subscription only; does not skip job charges)")
    line("  job_funding_waived: #{profile.job_funding_waived}")
    line

    if profile.job_funding_waived?
      block("job_funding_waived is true — this company would skip the job PaymentIntent")
    end
    unless demo_mode?
      block("Company has no Stripe customer") unless customer_present
      block("Company has no saved payment method") if customer_present && !pm_present
    end
    if tier.blank?
      block("Company membership tier config is missing for #{profile.membership_level}")
    elsif tier.slug == "premium" && tier.commission_percent.to_f.zero?
      block("Company Premium chart commission is still 0% — run the repair migration or set Admin pricing")
    end
  end

  def print_existing_job(job, _company_profile)
    line("JOB")
    labor = job.agreed_labor_cents.to_i.positive? ? job.agreed_labor_cents.to_i : job.job_amount_cents.to_i
    snapshot = job.company_commission_percent_snapshot
    fee = snapshot.nil? ? nil : JobMoney.percent_of(labor, snapshot)
    charge = snapshot.nil? ? nil : JobMoney.company_charge_cents(labor, snapshot)
    collected = job.job_payment_transactions.status_succeeded.company_collections.sum(:amount_cents).to_i
    refunded = job.job_payment_transactions.status_succeeded.where(
      transaction_type: %w[counteroffer_refund final_hours_refund refund]
    ).sum(:amount_cents).to_i

    line("  id: #{job.id}")
    line("  status: #{job.status}")
    line("  labor = #{format_cents(labor)}")
    line("  company commission snapshot: #{snapshot.nil? ? "(missing)" : "#{snapshot}%"}")
    line("  company fee = #{fee.nil? ? "(cannot compute without snapshot)" : format_cents(fee)}")
    line("  expected Stripe charge = #{charge.nil? ? "(cannot compute without snapshot)" : format_cents(charge)}")
    line("  funding status: #{job.funding_status}")
    line("  net collected: #{format_cents(collected - refunded)}")
    line("  financial revision: #{job.financial_revision}")
    line("  pay basis: #{job.pay_basis}")
    line

    if job.priced? && snapshot.nil?
      block("Priced job is missing company_commission_percent_snapshot")
    end
    if job.priced? && charge.to_i.positive? && collected.zero? && !job.job_funding_waived?
      note("Job has no successful company collections yet")
    end
  end

  def print_proposed_job(company_profile, labor_cents)
    line("PROPOSED JOB")
    if company_profile.blank? || labor_cents.nil?
      line("  (needs COMPANY_EMAIL and LABOR_CENTS)")
      line
      return
    end

    percent = MembershipPolicy.company_commission_percent(company_profile)
    fee = JobMoney.percent_of(labor_cents, percent)
    charge = JobMoney.company_charge_cents(labor_cents, percent)

    line("  labor = #{format_cents(labor_cents)}")
    line("  company commission = #{percent}%")
    line("  company fee = #{format_cents(fee)}")
    line("  expected Stripe charge = #{format_cents(charge)}")
    line("  (these rates would be snapshotted at post; no Job or PaymentIntent is created)")
    line
  end

  def print_technician(user, profile, job:, labor_cents:)
    line("TECHNICIAN")
    if profile.blank?
      if job
        line("  (none resolved — pass JOB_ID with an accepted claim, or TECHNICIAN_EMAIL)")
      else
        line("  (none supplied — pass TECHNICIAN_EMAIL to include payout economics)")
      end
      line
      return
    end

    live = MembershipPolicy.technician_commission_percent(profile)
    snapshot = job&.technician_commission_percent_snapshot
    account_id = profile.stripe_account_id.presence
    connect = retrieve_connect_status(profile)
    payout_ready = connect[:payout_ready]
    proposed_labor = labor_cents || job_labor_cents(job)

    line("  membership tier: #{profile.membership_level}")
    line("  effective technician commission %: #{live}")
    if job
      line("  technician commission snapshot: #{snapshot.nil? ? "(none yet — set at claim)" : "#{snapshot}%"}")
    end
    line("  Connect account: #{account_id || "(none)"}")
    line("  charges_enabled: #{connect[:charges_enabled]}")
    line("  payouts_enabled: #{connect[:payouts_enabled]}")
    line("  transfers capability: #{connect[:transfers]}")
    line("  payout readiness: #{payout_ready}")

    percent_for_quote = snapshot.nil? ? live : snapshot
    if proposed_labor
      fee = JobMoney.percent_of(proposed_labor, percent_for_quote)
      net = JobMoney.technician_payout_cents(proposed_labor, percent_for_quote)
      line("  proposed gross = #{format_cents(proposed_labor)}")
      line("  technician fee = #{format_cents(fee)}")
      line("  expected net transfer = #{format_cents(net)}")
    end
    line

    if job&.filled? || job&.finished?
      if snapshot.nil?
        block("Claimed/finished job is missing technician_commission_percent_snapshot")
      end
      block("Technician Connect account is not payout-ready") unless payout_ready
    elsif job.nil? && @technician_email.present?
      block("Technician Connect account is not payout-ready") unless payout_ready
    end
  end

  def print_expected_settlement(job)
    line("EXPECTED SETTLEMENT")
    begin
      ledger = JobLedger.for(job)
      tech_fee = ledger.technician_commission_cents
      tech_net = ledger.technician_net_payout_cents
      line("  technician gross: #{format_cents(ledger.technician_gross_cents)}")
      line("  technician fee: #{tech_fee.nil? ? "(missing technician snapshot)" : format_cents(tech_fee)}")
      line("  technician net payout: #{tech_net.nil? ? "(missing technician snapshot)" : format_cents(tech_net)}")
      line("  TechFlash company-side fee: #{format_cents(ledger.company_commission_cents)}")
      line("  TechFlash technician-side fee: #{tech_fee.nil? ? "(missing technician snapshot)" : format_cents(tech_fee)}")
      if ledger.company_commission_cents && tech_fee
        line("  TechFlash gross before Stripe fees: #{format_cents(ledger.company_commission_cents + tech_fee)}")
      end
    rescue JobLedger::MissingCommissionSnapshotError => e
      line("  cannot compute: #{e.message}")
      block(e.message)
    end
    line
  end

  def print_stripe_mode
    line("STRIPE")
    line("  detected mode: #{StripeModeGuard.mode_label}")
    line("  rails env: #{Rails.env}")
    if StripeModeGuard.error_message
      block(StripeModeGuard.error_message)
    end
    line
  end

  def print_verdict
    line("READY FOR LIVE PAYMENT: #{@blockers.empty? ? "YES" : "NO"}")
    unless @blockers.empty?
      line("BLOCKING REASONS:")
      @blockers.each { |b| line("  - #{b}") }
    end
    unless @notes.empty?
      line("NOTES:")
      @notes.each { |n| line("  - #{n}") }
    end
  end

  def job_labor_cents(job)
    return nil if job.blank?

    job.agreed_labor_cents.to_i.positive? ? job.agreed_labor_cents.to_i : job.job_amount_cents.to_i
  end

  # Retrieve-only. Does not create customers or clear stale IDs.
  def payment_method_present?(user)
    return false if user.blank?
    return true if demo_mode?

    customer_id = user.stripe_customer_id.to_s.presence
    return false if customer_id.blank?
    return true if Rails.env.test?

    JobFundingService.default_payment_method_id(customer_id).present?
  rescue Stripe::StripeError
    false
  end

  # Retrieve-only. Does not sync flags onto the technician profile.
  def retrieve_connect_status(profile)
    local_ready = StripeConnectAccountService.payout_ready?(profile, sync: false)
    status = {
      charges_enabled: profile.stripe_charges_enabled,
      payouts_enabled: profile.stripe_payouts_enabled,
      transfers: profile.stripe_transfers_capability_status.presence || "(unknown)",
      payout_ready: local_ready
    }
    return status if demo_mode? || Rails.env.test? || profile.stripe_account_id.blank? || Stripe.api_key.blank?

    account = Stripe::Account.retrieve(profile.stripe_account_id)
    transfers = account.capabilities&.transfers.to_s.presence || "(unknown)"
    live_ready = !!account.charges_enabled && !!account.payouts_enabled && transfers == "active"
    {
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      transfers: transfers,
      payout_ready: live_ready
    }
  rescue Stripe::StripeError
    status
  end

  def format_cents(cents)
    format("$%.2f", cents.to_i / 100.0)
  end

  def block(message)
    @blockers << message unless @blockers.include?(message)
  end

  def note(message)
    @notes << message
  end

  def demo_mode?
    defined?(DemoMode) && DemoMode.enabled?
  end
end
