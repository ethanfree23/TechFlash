# frozen_string_literal: true

module Assessments
  # Imports a whole assessment — metadata, rules, categories and question bank —
  # from one structured Hash (in practice a JSON file under
  # db/assessment_seeds/). This is the supported way to add the HVAC, Plumbing
  # and Electrical banks without touching engine code.
  #
  # The full document schema, with a worked example, is documented in
  # docs/ASSESSMENTS.md and mirrored by db/assessment_seeds/EXAMPLE.json.
  #
  # Guarantees:
  #   * Idempotent. Re-importing the same file updates the draft in place,
  #     matching questions by `external_key`, and does not duplicate content.
  #   * Never mutates published content. Importing into a published version is
  #     refused; pass "on_published": "new_version" to clone a fresh draft
  #     instead, which leaves historical attempts and results intact.
  #   * Validates before writing. Everything runs in one transaction and rolls
  #     back on any problem, so a partially valid file cannot half-load.
  class ContentImporter
    Result = Struct.new(
      :success,
      :assessment,
      :version,
      :problems,
      :stats,
      :published,
      keyword_init: true
    ) do
      def success?
        success
      end
    end

    DIFFICULTIES = AssessmentQuestion.difficulties.keys.freeze

    VERSION_ATTRIBUTES = %w[
      instructions question_count time_limit_minutes passing_score max_attempts
      retake_wait_hours randomize_questions randomize_answer_choices allow_resume
      allow_back_navigation scoring_strategy
    ].freeze

    class ImportError < StandardError; end

    attr_reader :document, :dry_run

    def self.call(document, dry_run: false)
      new(document, dry_run: dry_run).call
    end

    # Documentation fixtures that live alongside real seeds but must never be
    # loaded into an environment.
    SKIPPED_SEED_FILES = %w[EXAMPLE.json].freeze

    # Imports every *.json file in a directory, sorted by filename so ordering
    # is deterministic.
    def self.import_directory(path, dry_run: false)
      seed_files(path).map do |file|
        [file, import_file(file, dry_run: dry_run)]
      end
    end

    def self.seed_files(path)
      Dir.glob(File.join(path, "*.json"))
         .reject { |file| SKIPPED_SEED_FILES.include?(File.basename(file)) }
         .sort
    end

    def self.import_file(path, dry_run: false)
      call(JSON.parse(File.read(path)), dry_run: dry_run)
    rescue JSON::ParserError => e
      Result.new(success: false, problems: ["#{File.basename(path)} is not valid JSON: #{e.message}"], stats: {})
    end

    def initialize(document, dry_run: false)
      @document = (document || {}).to_h.deep_stringify_keys
      @dry_run = dry_run
      @problems = []
      @stats = { categories: 0, questions_created: 0, questions_updated: 0, questions_deactivated: 0, choices: 0 }
    end

    def call
      structural = structural_problems
      return failure(structural) if structural.any?

      assessment = nil
      version = nil
      published = false

      ActiveRecord::Base.transaction do
        assessment = upsert_assessment!
        version = resolve_version!(assessment)
        apply_version_config!(version)
        import_categories!(version)

        problems = VersionValidator.new(version.reload).problems
        if publish_requested? && problems.any?
          @problems.concat(problems)
          raise ImportError, "version is not publishable"
        end

        if publish_requested?
          publish_result = VersionPublisher.publish!(version)
          unless publish_result.success?
            @problems.concat(publish_result.problems)
            raise ImportError, "publish failed"
          end
          published = true
        end

        raise ActiveRecord::Rollback if dry_run
      end

      Result.new(
        success: true,
        assessment: assessment,
        version: version,
        problems: @problems,
        stats: @stats,
        published: published
      )
    rescue ImportError
      failure(@problems)
    rescue ActiveRecord::RecordInvalid => e
      failure(@problems + e.record.errors.full_messages)
    end

    private

    def assessment_doc
      document["assessment"] || {}
    end

    def version_doc
      document["version"] || {}
    end

    def category_docs
      Array(document["categories"])
    end

    def structural_problems
      list = []
      list << "assessment.slug is required" if assessment_doc["slug"].to_s.strip.empty?
      list << "assessment.title is required" if assessment_doc["title"].to_s.strip.empty?
      list << "categories must contain at least one entry" if category_docs.empty?

      category_docs.each_with_index do |category, index|
        label = category["slug"].presence || "categories[#{index}]"
        list << "#{label}: slug is required" if category["slug"].to_s.strip.empty?
        list << "#{label}: name is required" if category["name"].to_s.strip.empty?

        Array(category["questions"]).each_with_index do |question, question_index|
          list.concat(question_problems(question, "#{label}.questions[#{question_index}]"))
        end
      end

      bands = ScoreBands.new(version_doc["score_bands"] || ScoreBands.starter_template)
      list << "version.score_bands are invalid: #{bands.errors.join('; ')}" unless bands.valid?

      strategy = version_doc["scoring_strategy"]
      if strategy.present? && !AssessmentVersion::SCORING_STRATEGIES.include?(strategy.to_s)
        list << "version.scoring_strategy must be one of #{AssessmentVersion::SCORING_STRATEGIES.join(', ')}"
      end

      list
    end

    def question_problems(question, label)
      list = []
      list << "#{label}: prompt is required" if question["prompt"].to_s.strip.empty?

      difficulty = question["difficulty"]
      if difficulty.present? && !DIFFICULTIES.include?(difficulty.to_s)
        list << "#{label}: difficulty must be one of #{DIFFICULTIES.join(', ')}"
      end

      choices = Array(question["choices"])
      list << "#{label}: at least two choices are required" if choices.size < 2

      correct = choices.count { |choice| truthy?(choice["correct"]) }
      list << "#{label}: exactly one choice must be marked correct (found #{correct})" unless correct == 1

      choices.each_with_index do |choice, index|
        list << "#{label}.choices[#{index}]: body is required" if choice["body"].to_s.strip.empty?
      end

      list
    end

    def upsert_assessment!
      assessment = Assessment.find_or_initialize_by(slug: assessment_doc["slug"].to_s.strip)
      assessment.title = assessment_doc["title"].to_s.strip
      assessment.description = assessment_doc["description"] if assessment_doc.key?("description")
      assessment.company_disclaimer = assessment_doc["company_disclaimer"] if assessment_doc.key?("company_disclaimer")
      assessment.trade_type = assessment_doc["trade_type"] if assessment_doc.key?("trade_type")
      assessment.active = truthy?(assessment_doc["active"]) if assessment_doc.key?("active")
      assessment.position = assessment_doc["position"].to_i if assessment_doc.key?("position")
      assessment.public_result_rule = assessment_doc["public_result_rule"] if assessment_doc.key?("public_result_rule")
      assessment.metadata = assessment_doc["metadata"] if assessment_doc.key?("metadata")
      assessment.save!
      assessment
    end

    def resolve_version!(assessment)
      requested = version_doc["version_number"]
      existing =
        if requested.present?
          assessment.assessment_versions.find_by(version_number: requested.to_i)
        else
          assessment.assessment_versions.draft.order(version_number: :desc).first
        end

      return create_version!(assessment, requested) if existing.blank?
      return existing if existing.draft?

      case version_doc["on_published"].to_s
      when "new_version"
        VersionPublisher.clone_to_draft(existing).version
      else
        @problems << "assessment version #{existing.version_number} is #{existing.status} and is immutable. " \
                     "Use a new version_number, or set \"on_published\": \"new_version\" to clone it into a draft."
        raise ImportError, "version immutable"
      end
    end

    def create_version!(assessment, requested)
      assessment.assessment_versions.create!(
        version_number: requested.presence&.to_i || assessment.next_version_number,
        status: :draft,
        score_bands: version_doc["score_bands"] || ScoreBands.starter_template
      )
    end

    def apply_version_config!(version)
      attrs = version_doc.slice(*VERSION_ATTRIBUTES)
      attrs["score_bands"] = version_doc["score_bands"] if version_doc.key?("score_bands")
      attrs["metadata"] = version_doc["metadata"] if version_doc.key?("metadata")
      version.update!(attrs) if attrs.any?

      # When the blueprint declares per-category counts, question_count is
      # derived from them so the two can never drift.
      version
    end

    def import_categories!(version)
      seen_category_ids = []

      category_docs.each_with_index do |category_doc, index|
        category = version.assessment_categories.find_or_initialize_by(slug: category_doc["slug"].to_s.strip)
        category.name = category_doc["name"].to_s.strip
        category.description = category_doc["description"] if category_doc.key?("description")
        category.question_count = category_doc["question_count"].to_i if category_doc.key?("question_count")
        category.weight = category_doc["weight"] if category_doc.key?("weight")
        category.position = category_doc.key?("position") ? category_doc["position"].to_i : index
        category.save!
        seen_category_ids << category.id
        @stats[:categories] += 1

        import_questions!(version, category, Array(category_doc["questions"]))
      end

      # Categories dropped from the document are removed from the draft; this is
      # safe precisely because drafts have no attempts against them.
      version.assessment_categories.where.not(id: seen_category_ids).destroy_all

      derived = version.reload.assessment_categories.sum(:question_count)
      version.update!(question_count: derived) if derived.positive?
    end

    def import_questions!(version, category, question_docs)
      seen_keys = []

      question_docs.each_with_index do |question_doc, index|
        key = question_doc["external_key"].presence
        question =
          if key.present?
            version.assessment_questions.find_or_initialize_by(external_key: key)
          else
            version.assessment_questions.new
          end

        created = question.new_record?
        question.assessment_category_id = category.id
        question.assessment_version_id = version.id
        question.prompt = question_doc["prompt"].to_s.strip
        question.explanation = question_doc["explanation"] if question_doc.key?("explanation")
        question.difficulty = question_doc["difficulty"] if question_doc["difficulty"].present?
        question.active = question_doc.key?("active") ? truthy?(question_doc["active"]) : true
        question.position = question_doc.key?("position") ? question_doc["position"].to_i : index
        question.media_url = question_doc["media_url"] if question_doc.key?("media_url")
        question.media_type = question_doc["media_type"] if question_doc.key?("media_type")
        question.media_alt_text = question_doc["media_alt_text"] if question_doc.key?("media_alt_text")
        question.metadata = question_doc["metadata"] if question_doc.key?("metadata")
        question.save!

        created ? @stats[:questions_created] += 1 : @stats[:questions_updated] += 1
        seen_keys << key if key.present?

        import_choices!(question, Array(question_doc["choices"]))
      end

      # Questions no longer in the document are deactivated rather than deleted,
      # keeping their text available for analysis of older drafts.
      stale = category.assessment_questions.active
      stale = stale.where.not(external_key: seen_keys) if seen_keys.any?
      stale = stale.where.not(external_key: nil)
      deactivated = stale.count
      stale.update_all(active: false, updated_at: Time.current) if deactivated.positive?
      @stats[:questions_deactivated] += deactivated
    end

    def import_choices!(question, choice_docs)
      # Choices are the answer key; rewriting them wholesale keeps the stored
      # set exactly equal to the document and avoids stale orphans.
      question.assessment_answer_choices.destroy_all

      choice_docs.each_with_index do |choice_doc, index|
        question.assessment_answer_choices.create!(
          external_key: choice_doc["external_key"].presence || choice_doc["key"].presence,
          body: choice_doc["body"].to_s.strip,
          correct: truthy?(choice_doc["correct"]),
          position: choice_doc.key?("position") ? choice_doc["position"].to_i : index
        )
        @stats[:choices] += 1
      end
    end

    def publish_requested?
      truthy?(version_doc["publish"])
    end

    def truthy?(value)
      ActiveModel::Type::Boolean.new.cast(value) == true
    end

    def failure(problems)
      Result.new(
        success: false,
        assessment: nil,
        version: nil,
        problems: problems.uniq,
        stats: @stats,
        published: false
      )
    end
  end
end
