# frozen_string_literal: true

namespace :jobs do
  desc <<~DESC.gsub(/\s+/, " ").strip
    READ-ONLY dry-run report: priced jobs stamped funding_status=funded with zero
    succeeded company collections and outstanding required funding. Separates
    (A) verified waiver candidates from (B) inconsistent stamps needing manual
    investigation. NEVER writes. (No write mode exists.)
  DESC
  task reclassify_waived_funding: :environment do
    if ENV["CONFIRM"].to_s.strip == "1"
      abort "[jobs:reclassify_waived_funding] REFUSED: this task is dry-run only and never writes. Unset CONFIRM."
    end

    puts "[jobs:reclassify_waived_funding] mode=DRY-RUN (read-only; never writes)"
    puts "Shared selection (ALL of):"
    puts "  - funding_status = funded"
    puts "  - priced (company_required can be > 0)"
    puts "  - succeeded company collections sum = 0"
    puts "  - ledger company_required_cents > 0 (or missing snapshot) AND not vacuous cash fully_funded"
    puts "Category A (verified waiver candidates): company.job_funding_waived=true"
    puts "  OR posted_under_funding_waiver already true (normalize funding_status)."
    puts "  Proposed: funding_status -> unfunded; posted_under_funding_waiver -> true."
    puts "Category B (investigation only): inconsistent funded-without-cash WITHOUT"
    puts "  verified company/job waiver evidence. NO automatic waiver proposal."
    puts "Preserved always: job.status, settlement_status, financial_revision, transactions."

    category_a = []
    category_b = []

    Job.funding_funded.includes(:company_profile, :job_payment_transactions).find_each do |job|
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
        next if required.to_i <= 0
        next if fully_funded && net_funded.positive?
      rescue JobLedger::MissingCommissionSnapshotError => e
        ledger_error = e.message
      end

      company_waived = !!job.company_profile&.job_funding_waived?
      marker = job.posted_under_funding_waiver?
      verified = company_waived || marker

      base = {
        job_id: job.id,
        company_profile_id: job.company_profile_id,
        company_name: job.company_profile.try(:company_name) || job.company_profile.try(:name),
        company_job_funding_waived: company_waived,
        job_status: job.status,
        settlement_status: job.settlement_status,
        financial_revision: job.financial_revision,
        funding_before: job.funding_status,
        waiver_before: marker,
        collected_cents: collected,
        refunded_cents: refunded,
        net_funded_cents: net_funded,
        company_required_cents: required,
        fully_funded: fully_funded,
        labor_cents: job.agreed_labor_cents.to_i,
        ledger_error: ledger_error
      }

      if verified
        reason =
          if marker && company_waived
            "verified: marker set and company waived — normalize funding_status; keep waiver"
          elsif marker
            "verified: marker already set — normalize funding_status only"
          else
            "verified: company.job_funding_waived publish historically stamped :funded without collections"
          end
        category_a << base.merge(
          category: "A",
          funding_after: "unfunded",
          waiver_after: true,
          reason: reason
        )
      else
        category_b << base.merge(
          category: "B",
          funding_after: "(no automatic proposal — owner record-specific authorization required)",
          waiver_after: "(do NOT invent posted_under_funding_waiver=true)",
          reason: "investigation: priced :funded with zero collections and outstanding required; no verified waiver evidence"
        )
      end
    end

    print_row = lambda do |row|
      puts "---"
      puts "category: #{row[:category]}"
      puts "job_id: #{row[:job_id]}"
      puts "company_profile_id: #{row[:company_profile_id]} (#{row[:company_name]})"
      puts "company.job_funding_waived: #{row[:company_job_funding_waived]}"
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

    if category_a.empty? && category_b.empty?
      puts "No candidates found."
      next
    end

    puts "==== CATEGORY A — verified waiver candidates (proposed correction) ===="
    if category_a.empty?
      puts "(none)"
    else
      category_a.each { |row| print_row.call(row) }
    end

    puts "==== CATEGORY B — inconsistent funded-without-cash (manual investigation) ===="
    if category_b.empty?
      puts "(none)"
    else
      category_b.each { |row| print_row.call(row) }
    end

    puts "---- end report ----"
    puts "Category A count: #{category_a.size}"
    puts "Category B count: #{category_b.size}"
    puts "This task does not write. Owner must approve a separate change window before any UPDATE."
    puts "Category A future correction MUST touch only funding_status + posted_under_funding_waiver."
    puts "Category B must not invent waiver authorization without record-specific owner approval."
  end
end
