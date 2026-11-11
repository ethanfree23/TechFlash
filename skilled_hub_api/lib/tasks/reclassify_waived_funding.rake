# frozen_string_literal: true

namespace :jobs do
  desc <<~DESC.gsub(/\s+/, " ").strip
    Reclassify jobs whose funding_status=funded is not backed by succeeded company
    collections, when the company has job_funding_waived. Sets funding_status=unfunded
    and posted_under_funding_waiver=true. Preserves job.status (e.g. open). Uses ledger
    evidence (succeeded collections sum), not a blanket status rewrite. Dry-run by
    default; set CONFIRM=1 to write. Idempotent.
  DESC
  task reclassify_waived_funding: :environment do
    confirm = ENV["CONFIRM"].to_s.strip == "1"
    mode = confirm ? "WRITE" : "DRY-RUN"
    audit_path = ENV["AUDIT_LOG"].presence

    puts "[jobs:reclassify_waived_funding] mode=#{mode}"
    puts "Selection: funding_status=funded AND company.job_funding_waived=true " \
         "AND sum(succeeded company collections)=0"
    puts "Action: funding_status -> unfunded, posted_under_funding_waiver -> true " \
         "(status unchanged)"

    candidates = []
    Job.funding_funded.includes(:company_profile, :job_payment_transactions).find_each do |job|
      next unless job.company_profile&.job_funding_waived?

      collected = job.job_payment_transactions.company_collections.status_succeeded.sum(:amount_cents).to_i
      next if collected.positive?

      # Skip vacuous cash-funded unpriced jobs (required 0 / already fully_funded with $0).
      begin
        next if !job.priced? && JobLedger.for(job).fully_funded
      rescue JobLedger::MissingCommissionSnapshotError
        # Still a candidate if we cannot prove vacuous funding.
      end

      candidates << {
        job_id: job.id,
        company_profile_id: job.company_profile_id,
        job_status: job.status,
        funding_before: job.funding_status,
        funding_after: "unfunded",
        waiver_before: job.posted_under_funding_waiver?,
        waiver_after: true,
        collected_cents: collected,
        labor_cents: job.agreed_labor_cents.to_i
      }
    end

    if candidates.empty?
      puts "No candidates found."
      next
    end

    puts "---- DRY-RUN CORRECTION REPORT (from -> to) ----"
    puts "job_id | company | job_status | funding_status | posted_under_funding_waiver | collected_cents | labor_cents"
    lines = candidates.map do |row|
      detail =
        "job_id=#{row[:job_id]} company=#{row[:company_profile_id]} status=#{row[:job_status]} " \
        "funding: #{row[:funding_before]} -> #{row[:funding_after]} " \
        "posted_under_funding_waiver: #{row[:waiver_before]} -> #{row[:waiver_after]} " \
        "collected_cents=#{row[:collected_cents]} labor_cents=#{row[:labor_cents]}"
      table =
        "#{row[:job_id]} | #{row[:company_profile_id]} | #{row[:job_status]} | " \
        "#{row[:funding_before]} -> #{row[:funding_after]} | " \
        "#{row[:waiver_before]} -> #{row[:waiver_after]} | " \
        "#{row[:collected_cents]} | #{row[:labor_cents]}"
      puts table
      detail
    end
    puts "---- end report ----"
    puts "Total candidates: #{candidates.size}"

    if audit_path
      File.open(audit_path, "a") do |f|
        f.puts("# #{Time.now.utc.iso8601} mode=#{mode} candidates=#{candidates.size}")
        lines.each { |line| f.puts(line) }
      end
      puts "Audit log appended: #{audit_path}"
    end

    unless confirm
      puts "Dry-run only. Re-run with CONFIRM=1 to apply updates. Optional AUDIT_LOG=/path/to.log"
      next
    end

    updated = 0
    Job.transaction do
      candidates.each do |row|
        job = Job.lock.find(row[:job_id])
        next unless job.funding_funded?
        next unless job.company_profile&.job_funding_waived?

        collected = job.job_payment_transactions.company_collections.status_succeeded.sum(:amount_cents).to_i
        next if collected.positive?

        job.update!(funding_status: :unfunded, posted_under_funding_waiver: true)
        updated += 1
      end
    end

    puts "Updated #{updated} job(s). status columns were not modified."
  end
end
