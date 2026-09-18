# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Programmatic import of a whole assessment (metadata, rules, categories,
      # question bank) from one JSON document.
      #
      # This is the same code path as the assessments:import rake task, so a
      # bank can be authored as a file, validated with a dry run, and loaded
      # either from the admin UI or from a deploy script. The document schema is
      # documented in docs/ASSESSMENTS.md.
      class AssessmentImportsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # POST /api/v1/admin/assessment_imports
        # Pass dry_run=true to validate a document and see the resulting stats
        # without writing anything.
        def create
          document = import_document
          return render json: { error: "An assessment document is required" }, status: :unprocessable_entity if document.blank?

          dry_run = ActiveModel::Type::Boolean.new.cast(params[:dry_run]) == true
          result = Assessments::ContentImporter.call(document, dry_run: dry_run)

          unless result.success?
            return render json: {
              error: "Assessment import failed",
              dry_run: dry_run,
              problems: result.problems
            }, status: :unprocessable_entity
          end

          # A dry run rolls its transaction back, so the records it built no
          # longer exist by the time the response is rendered — report the
          # validated stats only.
          payload = { dry_run: dry_run, published: result.published, problems: result.problems, stats: result.stats }
          unless dry_run
            payload[:assessment] = ::Admin::AssessmentSerializer.new(result.assessment).as_json
            payload[:version] = ::Admin::AssessmentVersionSerializer.new(result.version.reload).as_json
          end

          render json: payload, status: dry_run ? :ok : :created
        end

        # GET /api/v1/admin/assessment_imports/schema
        # Serves the documented import contract so the next content task (and
        # the admin UI) can read the expected shape from the running API.
        def schema
          render json: {
            format: "application/json",
            score_band_template: Assessments::ScoreBands.starter_template,
            difficulties: AssessmentQuestion.difficulties.keys,
            scoring_strategies: AssessmentVersion::SCORING_STRATEGIES,
            public_result_rules: Assessment::PUBLIC_RESULT_RULES,
            trade_options: TradeCatalog::OPTIONS,
            documentation: "docs/ASSESSMENTS.md",
            fields: Assessments::ImportSchema.fields,
            example: Assessments::ImportSchema.example
          }, status: :ok
        end

        private

        # Accepts a nested "document" object, a raw JSON string (so an admin can
        # paste a file's contents straight into a textarea), or the document at
        # the top level of the request body.
        def import_document
          if params[:document].present?
            raw = params[:document]
            return parse_string(raw) if raw.is_a?(String)

            return raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h
          end

          top_level = params[:assessment].present? && params[:categories].present?
          return nil unless top_level

          {
            "assessment" => unwrap(params[:assessment]),
            "version" => unwrap(params[:version]),
            "categories" => Array(params[:categories]).map { |entry| unwrap(entry) }
          }
        end

        def parse_string(raw)
          JSON.parse(raw)
        rescue JSON::ParserError
          nil
        end

        def unwrap(value)
          return nil if value.nil?
          return value.to_unsafe_h if value.respond_to?(:to_unsafe_h)
          return value.to_h if value.respond_to?(:to_h)

          value
        end
      end
    end
  end
end
