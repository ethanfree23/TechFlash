# frozen_string_literal: true

namespace :jobs do
  desc <<~DESC.gsub(/\s+/, " ").strip
    READ-ONLY dry-run report: priced jobs stamped funding_status=funded with zero
    succeeded company collections and outstanding required funding. Prints one row
    per candidate with ledger evidence. NEVER writes. (No write mode exists.)
  DESC
  task reclassify_waived_funding: :environment do
    if ENV["CONFIRM"].to_s.strip == "1"
      abort "[jobs:reclassify_waived_funding] REFUSED: this task is dry-run only and never writes. Unset CONFIRM."
    end

    puts "[jobs:reclassify_waived_funding] mode=DRY-RUN (read-only; never writes)"
    puts "Selection (ALL of):"
    puts "  - funding_status = funded"
    puts "  - priced (agreed_labor / job_amount > 0 ⇒ company_required can be > 0)"
    puts "  - succeeded company collections sum = 0"
    puts "  - ledger company_required_cents > 0 (or missing snapshot) AND not vacuous fully_funded"
    puts "  - settlement_status reported (unchanged by any future correction)"
    puts "Corroborating evidence (reason only; not a hard gate): company.job_funding_waived,"
    puts "  posted_under_funding_waiver already true/false."
    puts "Proposed fields ONLY: funding_status -> unfunded; posted_under_funding_waiver -> true."
    puts "Preserved: job.status, settlement_status, financial_revision, all transactions."

    candidates = []
    Job.funding_funded.includes(:company_profile, :job_payment_transactions).find_each do |job|
      # Vacuous zero-funding jobs (!priced?, required=0) are legitimate :funded — skip.
      next unless job.priced?

      collected = job.succeeded_company_collected_cents
      refunded = job.job_payment_transactions.company_refunds.status_succeeded.sum(:amount_cents).to_i
      next if collected.positive?

      fully_funded = nil
      net_funded = collected - refunded
      required = nil
      ledger_error = nil
      begin
        ledger = JobLedger.for(job)
        required = ledger.company_required_cents
        fully_funded = ledger.fully_funded
        net_funded = ledger.net_funded_cents
        # Outstanding funding must exist; vacuous required=0 is not a candidate.
        next if required.to_i <= 0
        next if fully_funded && net_funded.positive?
      rescue JobLedger::MissingCommissionSnapshotError => e
        ledger_error = e.message
      end

      company_waived = !!job.company_profile&.job_funding_waived?
      reason =
        if job.posted_under_funding_waiver?
          "priced :funded with zero collections; marker already set — normalize funding_status only"
        elsif company_waived
          "admin job_funding_waived publish historically stamped :funded without succeeded collections"
        else
          "priced :funded with zero collections and outstanding required (inconsistent stamp)"
        end

      candidates << {
        job_id: job.id,
        company_profile_id: job.company_profile_id,
        company_name: job.company_profile.try(:company_name) || job.company_profile.try(:name),
        company_job_funding_waived: company_waived,
        job_status: job.status,
        settlement_status: job.settlement_status,
        financial_revision: job.financial_revision,
        funding_before: job.funding_status,
        funding_after: "unfunded",
        waiver_before: job.posted_under_funding_waiver?,
        waiver_after: true,
        collected_cents: collected,
        refunded_cents: refunded,
        net_funded_cents: net_funded,
        company_required_cents: required,
        fully_funded: fully_funded,
        labor_cents: job.agreed_labor_cents.to_i,
        reason: reason,
        ledger_error: ledger_error
      }
    end

    if candidates.empty?
      puts "No candidates found."
      next
    end

    puts "---- DRY-RUN RECONCILIATION REPORT (read-only; one row per job) ----"
    candidates.each do |row|
      puts "---"
      puts "job_id: #{row[:job_id]}"
      puts "company_profile_id: #{row[:company_profile_id]} (#{row[:company_name]})"
      puts "company.job_funding_waived (corroborating): #{row[:company_job_funding_waived]}"
      puts "job.status (preserve): #{row[:job_status]}"
      puts "settlement_status (preserve): #{row[:settlement_status]}"
      puts "financial_revision (preserve): #{row[:financial_revision]}"
      puts "funding_status: #{row[:funding_before]} -> #{row[:funding_after]}"
      puts "posted_under_funding_waiver: #{row[:waiver_before]} -> #{row[:waiver_after]}"
      puts "collected_cents: #{row[:collected_cents]}"
      puts "refunded_cents: #{row[:refunded_cents]}"
      puts "net_funded_cents: #{row[:net_funded_cents]}"
      puts "company_required_cents: #{row[:company_required_cents].inspect}"
      puts "fully_funded: #{row[:fully_funded].inspect}"
      puts "labor_cents: #{row[:labor_cents]}"
      puts "reason: #{row[:reason]}"
      puts "ledger_error: #{row[:ledger_error].inspect}" if row[:ledger_error]
    end
    puts "---- end report ----"
    puts "Total candidates: #{candidates.size}"
    puts "This task does not write. Owner must approve a separate change window before any UPDATE."
    puts "Any future correction MUST touch only funding_status + posted_under_funding_waiver."
  end
end
