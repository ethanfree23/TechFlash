# frozen_string_literal: true

namespace :jobs do
  desc <<~DESC.gsub(/\s+/, " ").strip
    READ-ONLY dry-run report: jobs stamped funding_status=funded under company
    job_funding_waived with zero succeeded collections. Prints from->to plan with
    ledger evidence. NEVER writes. (Owner-approved write path is intentionally
    omitted from this task.)
  DESC
  task reclassify_waived_funding: :environment do
    if ENV["CONFIRM"].to_s.strip == "1"
      abort "[jobs:reclassify_waived_funding] REFUSED: this task is dry-run only and never writes. Unset CONFIRM."
    end

    puts "[jobs:reclassify_waived_funding] mode=DRY-RUN (read-only; never writes)"
    puts "Selection: funding_status=funded AND company.job_funding_waived=true " \
         "AND sum(succeeded company collections)=0"
    puts "Proposed: funding_status -> unfunded; posted_under_funding_waiver -> true; " \
         "job.status / settlement_status unchanged"

    candidates = []
    Job.funding_funded.includes(:company_profile, :job_payment_transactions).find_each do |job|
      next unless job.company_profile&.job_funding_waived?

      collected = job.job_payment_transactions.company_collections.status_succeeded.sum(:amount_cents).to_i
      refunded = job.job_payment_transactions.company_refunds.status_succeeded.sum(:amount_cents).to_i
      net = collected - refunded
      next if collected.positive?

      # Skip vacuous cash-funded unpriced jobs (required 0 / already fully_funded with $0).
      fully_funded = nil
      net_funded = net
      required = nil
      ledger_error = nil
      begin
        ledger = JobLedger.for(job)
        next if !job.priced? && ledger.fully_funded

        fully_funded = ledger.fully_funded
        net_funded = ledger.net_funded_cents
        required = ledger.company_required_cents
      rescue JobLedger::MissingCommissionSnapshotError => e
        ledger_error = e.message
      end

      candidates << {
        job_id: job.id,
        company_profile_id: job.company_profile_id,
        company_name: job.company_profile.try(:company_name) || job.company_profile.try(:name),
        job_status: job.status,
        settlement_status: job.settlement_status,
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
        reason: "admin job_funding_waived publish stamped funded without succeeded collections",
        ledger_error: ledger_error
      }
    end

    if candidates.empty?
      puts "No candidates found."
      next
    end

    puts "---- DRY-RUN RECONCILIATION REPORT (read-only) ----"
    puts "job_id | company_id | job_status | settlement | funding | waiver | " \
         "collected | net_funded | required | fully_funded | reason"
    candidates.each do |row|
      puts [
        row[:job_id],
        row[:company_profile_id],
        row[:job_status],
        "#{row[:settlement_status]} (unchanged)",
        "#{row[:funding_before]} -> #{row[:funding_after]}",
        "#{row[:waiver_before]} -> #{row[:waiver_after]}",
        row[:collected_cents],
        row[:net_funded_cents],
        row[:company_required_cents].inspect,
        row[:fully_funded].inspect,
        row[:reason]
      ].join(" | ")
    end
    puts "---- end report ----"
    puts "Total candidates: #{candidates.size}"
    puts "This task does not write. Owner must approve a separate change window before any UPDATE."
  end
end
