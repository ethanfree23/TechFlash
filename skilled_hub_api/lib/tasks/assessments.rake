namespace :assessments do
  desc "Import an assessment JSON document (FILE=path/to/assessment.json)"
  task import: :environment do
    path = ENV["FILE"].to_s
    abort("FILE=path/to/assessment.json is required") if path.blank?
    abort("#{path} does not exist") unless File.exist?(path)

    result = Assessments::ContentImporter.import_file(path)
    report_import(File.basename(path), result)
    abort("Import failed") unless result.success?
  end

  desc "Validate an assessment JSON document without writing (FILE=path/to/assessment.json)"
  task validate: :environment do
    path = ENV["FILE"].to_s
    abort("FILE=path/to/assessment.json is required") if path.blank?
    abort("#{path} does not exist") unless File.exist?(path)

    result = Assessments::ContentImporter.import_file(path, dry_run: true)
    report_import(File.basename(path), result)
    abort("Validation failed") unless result.success?
  end

  desc "Import every assessment JSON document in db/assessment_seeds (DIR overrides, DRY_RUN=1 validates only)"
  task import_seeds: :environment do
    dir = ENV["DIR"].presence || Rails.root.join("db", "assessment_seeds").to_s
    dry_run = ActiveModel::Type::Boolean.new.cast(ENV["DRY_RUN"]) == true

    files = Assessments::ContentImporter.seed_files(dir)
    if files.empty?
      puts "No assessment seed files found in #{dir}."
      next
    end

    failures = 0
    files.each do |file|
      result = Assessments::ContentImporter.import_file(file, dry_run: dry_run)
      report_import(File.basename(file), result)
      failures += 1 unless result.success?
    end

    puts "#{files.size - failures}/#{files.size} assessment seed files #{dry_run ? 'validated' : 'imported'}."
    abort("#{failures} assessment seed file(s) failed") if failures.positive?
  end

  desc "Print the assessment import document schema example"
  task schema: :environment do
    puts JSON.pretty_generate(Assessments::ImportSchema.example)
  end

  desc "Score and close assessment attempts that ran past their time limit"
  task expire_attempts: :environment do
    before = AssessmentAttempt.in_progress.where.not(expires_at: nil).where(expires_at: ...Time.current).count
    Assessments::AttemptExpirer.sweep
    puts "Expired #{before} assessment attempt(s)."
  end

  desc "Notify technicians whose assessment retake waiting period has elapsed"
  task notify_retakes: :environment do
    count = Assessments::RetakeAvailabilitySweeper.call
    puts "Sent #{count} retake-available notification(s)."
  end

  desc "Rebuild the company-facing public result projection for every assessment"
  task rebuild_results: :environment do
    Assessment.find_each do |assessment|
      Assessments::PublicResultProjector.recompute_assessment(assessment)
      puts "Rebuilt results for #{assessment.slug}."
    end
  end

  def report_import(label, result)
    if result.success?
      stats = result.stats || {}
      puts "#{label}: OK (#{result.published ? 'published' : 'draft'}) " \
           "categories=#{stats[:categories]} created=#{stats[:questions_created]} " \
           "updated=#{stats[:questions_updated]} deactivated=#{stats[:questions_deactivated]} " \
           "choices=#{stats[:choices]}"
      Array(result.problems).each { |problem| puts "  warning: #{problem}" }
    else
      puts "#{label}: FAILED"
      Array(result.problems).each { |problem| puts "  - #{problem}" }
    end
  end
end
