# frozen_string_literal: true

# One-time HSI jobs #32–38 funding reclassify.
#
# Production usage (READ-ONLY by default):
#   bundle exec rails runner script/one_off/hsi_reclassify_32_38.rb
#
# APPLY (writes) — only after owner authorizes this exact script text/SHA:
#   APPLY=YES_HSI_32_38 \
#   OPERATOR_USER_ID=<admin user id> \
#   AUTHORIZATION_NOTE='owner-authorized HSI 32-38 reclassify <ticket/date>' \
#   GIT_SHA=<deployed commit sha> \
#   bundle exec rails runner script/one_off/hsi_reclassify_32_38.rb
#
# Audit model: JobTermChangeAudit (job_id, actor_user_id, change_type, reason,
# previous_values, new_values, timestamps). One row per job, same transaction.
#
# Updates ONLY via update_columns: funding_status, posted_under_funding_waiver, updated_at.
# Durable audit: JobTermChangeAudit rows (same DB transaction).
# NEVER invents payment rows. Do not run against production without owner APPLY gate.

require_relative "../../config/environment" unless defined?(Rails)

module OneOff
  class HsiReclassify3238
    Error = Class.new(StandardError)
    GuardFailure = Class.new(Error)
    InvariantFailure = Class.new(Error)
    AuditFailure = Class.new(Error)

    TARGET_JOB_IDS = [32, 33, 34, 35, 36, 37, 38].freeze
    COMPANY_PROFILE_ID = 8
    EXPECTED_REQUIRED_CENTS = 1_144_000
    EXPECTED_LABOR_CENTS = 1_040_000
    APPLY_TOKEN = "YES_HSI_32_38"
    CHANGE_TYPE = "hsi_funding_status_reclassify"
    SNAPSHOT_ATTRS = %w[
      id company_profile_id status funding_status settlement_status
      posted_under_funding_waiver financial_revision agreed_labor_cents updated_at
    ].freeze

    Result = Struct.new(
      :mode, :apply, :job_ids, :before, :guard_failures, :updated, :audits, :verification, keyword_init: true
    )

    def self.run!(**kwargs)
      new(**kwargs).run!
    end

    def initialize(
      job_ids: TARGET_JOB_IDS,
      company_profile_id: COMPANY_PROFILE_ID,
      expected_required_cents: EXPECTED_REQUIRED_CENTS,
      expected_labor_cents: EXPECTED_LABOR_CENTS,
      apply: nil,
      operator_user_id: nil,
      authorization_note: nil,
      git_sha: nil,
      stdout: $stdout
    )
      @job_ids = Array(job_ids).map(&:to_i)
      @company_profile_id = company_profile_id.to_i
      @expected_required_cents = expected_required_cents.to_i
      @expected_labor_cents = expected_labor_cents.to_i
      @apply = resolve_apply(apply)
      @operator_user_id = (operator_user_id || ENV["OPERATOR_USER_ID"]).presence&.to_i
      @authorization_note = (authorization_note || ENV["AUTHORIZATION_NOTE"]).to_s.strip
      @git_sha = (git_sha || ENV["GIT_SHA"] || ENV["COMMIT_SHA"] || "unknown").to_s
      @stdout = stdout
    end

    def run!
      say "==== HSI reclassify 32–38 ===="
      say "mode=#{@apply ? 'APPLY' : 'DRY-RUN (read-only)'}"
      say "job_ids=#{@job_ids.inspect} company_profile_id=#{@company_profile_id}"
      say "git_sha=#{@git_sha}"

      unless @apply
        return dry_run!
      end

      apply!
    end

    private

    def resolve_apply(explicit)
      return !!explicit unless explicit.nil?

      ENV["APPLY"].to_s == APPLY_TOKEN
    end

    def say(msg)
      @stdout.puts(msg)
    end

    def snapshot(job)
      SNAPSHOT_ATTRS.index_with { |attr| job.public_send(attr) }.merge(
        "ledger_company_required_cents" => safe_ledger(job)&.company_required_cents,
        "ledger_labor_cents" => safe_ledger(job)&.labor_cents,
        "ledger_net_funded_cents" => safe_ledger(job)&.net_funded_cents,
        "ledger_fully_funded" => safe_ledger(job)&.fully_funded,
        "job_payment_transactions_count" => job.job_payment_transactions.count,
        "payment_risk_events_count" => PaymentRiskEvent.where(job_id: job.id).count,
        "payments_count" => job.payments.count,
        "accepted_claims_count" => job.job_applications.accepted.count,
        "time_entries_count" => job.time_entries.count,
        "in_flight_transactions_count" => job.job_payment_transactions.in_flight.count
      )
    end

    def safe_ledger(job)
      JobLedger.for(job)
    rescue JobLedger::MissingCommissionSnapshotError
      nil
    end

    def dry_run!
      jobs = Job.where(id: @job_ids).order(:id).to_a
      before = jobs.map { |j| snapshot(j) }
      failures = collect_guard_failures(jobs)

      before.each do |row|
        say "--- BEFORE job_id=#{row['id']}"
        row.each { |k, v| say "  #{k}: #{v.inspect}" }
      end

      if failures.empty?
        say "GUARDS: PASS (#{jobs.size} jobs)"
      else
        say "GUARDS: FAIL"
        failures.each { |f| say "  - #{f}" }
      end
      say "DRY-RUN complete. No rows written."

      Result.new(
        mode: "dry_run",
        apply: false,
        job_ids: @job_ids,
        before: before,
        guard_failures: failures,
        updated: [],
        audits: [],
        verification: nil
      )
    end

    def apply!
      raise GuardFailure, "OPERATOR_USER_ID required for APPLY" if @operator_user_id.blank?
      raise GuardFailure, "AUTHORIZATION_NOTE required for APPLY" if @authorization_note.blank?

      operator = User.find_by(id: @operator_user_id)
      raise GuardFailure, "OPERATOR_USER_ID=#{@operator_user_id} not found" unless operator
      raise GuardFailure, "OPERATOR_USER_ID=#{@operator_user_id} must be admin" unless operator.admin?

      updated = []
      audits = []
      before = nil
      verification = nil

      ActiveRecord::Base.transaction do
        # Lock all seven rows in ascending ID order BEFORE final guards.
        jobs = Job.lock.where(id: @job_ids).order(:id).to_a
        before = jobs.map { |j| snapshot(j) }
        before.each do |row|
          say "--- BEFORE (locked) job_id=#{row['id']}"
          row.each { |k, v| say "  #{k}: #{v.inspect}" }
        end

        failures = collect_guard_failures(jobs)
        unless failures.empty?
          failures.each { |f| say "GUARD FAIL: #{f}" }
          raise GuardFailure, failures.join(" | ")
        end

        now = Time.current
        jobs.each do |job|
          prev = {
            "funding_status" => job.funding_status,
            "posted_under_funding_waiver" => job.posted_under_funding_waiver?,
            "updated_at" => job.updated_at
          }
          job.update_columns(
            funding_status: Job.funding_statuses.fetch("unfunded"),
            posted_under_funding_waiver: true,
            updated_at: now
          )
          job.reload
          updated << snapshot(job)

          audit = JobTermChangeAudit.create!(
            job: job,
            actor_user: operator,
            change_type: CHANGE_TYPE,
            reason: [
              @authorization_note,
              "git_sha=#{@git_sha}",
              "operator_user_id=#{operator.id}",
              "operator_email=#{operator.email}",
              "scope=HSI jobs #{@job_ids.join(',')}",
              "fields=funding_status,posted_under_funding_waiver,updated_at"
            ].join(" | "),
            previous_values: prev.merge(
              "batch_job_ids" => @job_ids,
              "company_profile_id" => @company_profile_id,
              "git_sha" => @git_sha,
              "authorization_note" => @authorization_note
            ),
            new_values: {
              "funding_status" => job.funding_status,
              "posted_under_funding_waiver" => job.posted_under_funding_waiver?,
              "updated_at" => job.updated_at,
              "git_sha" => @git_sha,
              "verification" => "pending_in_transaction"
            },
            requires_technician_acknowledgement: false
          )
          audits << audit
        end

        verification = verify_post_update!(jobs)
        # Stamp verification onto audits inside the same transaction.
        audits.each do |audit|
          audit.update!(
            new_values: audit.new_values.merge(
              "verification" => verification,
              "verified_at" => Time.current.iso8601
            )
          )
        end
      end

      say "APPLY complete. updated=#{updated.size} audits=#{audits.size}"
      say "verification=#{verification.inspect}"

      Result.new(
        mode: "apply",
        apply: true,
        job_ids: @job_ids,
        before: before,
        guard_failures: [],
        updated: updated,
        audits: audits,
        verification: verification
      )
    end

    def collect_guard_failures(jobs)
      failures = []
      ids = jobs.map(&:id)

      if ids.sort != @job_ids.sort
        failures << "job id set mismatch: loaded=#{ids.inspect} expected=#{@job_ids.inspect}"
      end
      if ids.size != @job_ids.size
        failures << "expected exactly #{@job_ids.size} jobs, loaded #{ids.size}"
      end
      unless ids == ids.sort
        failures << "jobs not loaded in ascending id order"
      end

      jobs.each do |job|
        failures.concat(guard_failures_for(job))
      end
      failures
    end

    def guard_failures_for(job)
      failures = []
      prefix = "job #{job.id}"

      unless job.company_profile_id == @company_profile_id
        failures << "#{prefix}: company_profile_id=#{job.company_profile_id} expected=#{@company_profile_id}"
      end
      unless job.status.to_s == "open"
        failures << "#{prefix}: status=#{job.status} expected=open"
      end
      unless job.financial_revision.to_i == 1
        failures << "#{prefix}: financial_revision=#{job.financial_revision} expected=1"
      end
      unless job.settlement_status.to_s == "unsettled"
        failures << "#{prefix}: settlement_status=#{job.settlement_status} expected=unsettled"
      end
      unless job.funding_status.to_s == "funded"
        failures << "#{prefix}: funding_status=#{job.funding_status} expected=funded"
      end
      if job.posted_under_funding_waiver?
        failures << "#{prefix}: posted_under_funding_waiver already true"
      end

      labor = job.agreed_labor_cents.to_i
      unless labor == @expected_labor_cents
        failures << "#{prefix}: agreed_labor_cents=#{labor} expected=#{@expected_labor_cents}"
      end

      begin
        ledger = JobLedger.for(job)
        unless ledger.company_required_cents.to_i == @expected_required_cents
          failures << "#{prefix}: ledger.company_required_cents=#{ledger.company_required_cents} expected=#{@expected_required_cents}"
        end
        unless ledger.labor_cents.to_i == @expected_labor_cents
          failures << "#{prefix}: ledger.labor_cents=#{ledger.labor_cents} expected=#{@expected_labor_cents}"
        end
        unless ledger.net_funded_cents.to_i.zero?
          failures << "#{prefix}: ledger.net_funded_cents=#{ledger.net_funded_cents} expected=0"
        end
        if ledger.fully_funded
          failures << "#{prefix}: ledger.fully_funded=true (expected false for outstanding required)"
        end
      rescue JobLedger::MissingCommissionSnapshotError => e
        failures << "#{prefix}: ledger unavailable (#{e.message})"
      end

      jtx = job.job_payment_transactions.count
      failures << "#{prefix}: job_payment_transactions.count=#{jtx} expected=0" unless jtx.zero?

      risk = PaymentRiskEvent.where(job_id: job.id).count
      failures << "#{prefix}: payment_risk_events.count=#{risk} expected=0" unless risk.zero?

      in_flight = job.job_payment_transactions.in_flight.count
      unless in_flight.zero?
        failures << "#{prefix}: in_flight job_payment_transactions=#{in_flight} (pending/uncertain collection)"
      end

      pay = job.payments.count
      failures << "#{prefix}: payments.count=#{pay} expected=0 (no payment/funding ops)" unless pay.zero?

      accepted = job.job_applications.accepted.count
      failures << "#{prefix}: accepted claims/assignments=#{accepted} expected=0" unless accepted.zero?

      te = job.time_entries.count
      failures << "#{prefix}: time_entries.count=#{te} expected=0 (recorded work)" unless te.zero?

      approved_hours = job.time_entries.where(status: TimeEntry.statuses[:approved]).count
      unless approved_hours.zero?
        failures << "#{prefix}: approved time_entries=#{approved_hours} expected=0"
      end

      failures
    end

    def verify_post_update!(jobs)
      report = []
      jobs.each do |job|
        job.reload
        errs = []
        errs << "funding_status=#{job.funding_status}" unless job.funding_unfunded?
        errs << "posted_under_funding_waiver=#{job.posted_under_funding_waiver?}" unless job.posted_under_funding_waiver?
        errs << "status=#{job.status}" unless job.status.to_s == "open"
        errs << "settlement_status=#{job.settlement_status}" unless job.settlement_status.to_s == "unsettled"
        errs << "financial_revision=#{job.financial_revision}" unless job.financial_revision.to_i == 1
        errs << "company_profile_id=#{job.company_profile_id}" unless job.company_profile_id == @company_profile_id
        errs << "jtx=#{job.job_payment_transactions.count}" unless job.job_payment_transactions.count.zero?
        errs << "risk=#{PaymentRiskEvent.where(job_id: job.id).count}" unless PaymentRiskEvent.where(job_id: job.id).count.zero?
        unless JobTermChangeAudit.where(job_id: job.id, change_type: CHANGE_TYPE).exists?
          errs << "missing JobTermChangeAudit"
        end
        if errs.any?
          raise InvariantFailure, "job #{job.id} post-update invariant failed: #{errs.join(', ')}"
        end
        report << { "job_id" => job.id, "ok" => true }
      end
      { "ok" => true, "jobs" => report, "git_sha" => @git_sha }
    end
  end
end

# rails runner evaluates this file; tests set HSI_RECLASSIFY_SKIP_AUTO_RUN=1 before require.
unless ENV["HSI_RECLASSIFY_SKIP_AUTO_RUN"].to_s == "1"
  begin
    OneOff::HsiReclassify3238.run!
  rescue OneOff::HsiReclassify3238::Error => e
    warn "[hsi_reclassify_32_38] ABORTED: #{e.message}"
    exit 1
  end
end
