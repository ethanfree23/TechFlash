module Api
  module V1
    module Admin
      class ReviewsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        def index
          reviews = Rating.includes(:job).order(created_at: :desc)
          reviews = reviews.where(moderation_status: params[:status]) if params[:status].present?
          reviews = reviews.where(reviewer_type: params[:reviewer_type]) if params[:reviewer_type].present?
          reviews = reviews.where(reviewee_type: params[:reviewee_type]) if params[:reviewee_type].present?
          reviews = reviews.limit(limit_param)

          render json: reviews, each_serializer: RatingSerializer, status: :ok
        end

        def flags
          flags = ReviewFlag.includes(:rating).order(created_at: :desc)
          flags = flags.where(status: params[:status]) if params[:status].present?
          flags = flags.limit(limit_param)

          render json: {
            flags: flags.map do |flag|
              {
                id: flag.id,
                reason: flag.reason,
                risk_score: flag.risk_score,
                status: flag.status,
                details: flag.details,
                rating_id: flag.rating_id,
                job_id: flag.rating&.job_id,
                created_at: flag.created_at
              }
            end
          }, status: :ok
        end

        def analytics
          reviews = Rating.where.not(moderation_status: :hidden)
          tech_reviews = reviews.where(reviewee_type: "TechnicianProfile")
          company_reviews = reviews.where(reviewee_type: "CompanyProfile")

          low_category_scores = Hash.new(0)
          reviews.find_each do |rating|
            next unless rating.category_scores.is_a?(Hash)
            rating.category_scores.each do |k, v|
              low_category_scores[k.to_s] += 1 if v.to_f <= 3.0
            end
          end

          render json: {
            average_technician_rating: average_for_type("TechnicianProfile"),
            average_company_rating: average_for_type("CompanyProfile"),
            review_completion_rate: review_completion_rate,
            recommendation_rate: recommendation_rate,
            response_rate: response_rate,
            repeat_hire_rate: repeat_hire_rate,
            most_common_low_scoring_category: low_category_scores.max_by { |_k, v| v }&.first,
            top_rated_technicians: top_entities_for("TechnicianProfile"),
            top_rated_companies: top_entities_for("CompanyProfile"),
            pending_flagged_reviews: Rating.where(moderation_status: :flagged).count,
            total_reviews: reviews.count,
            technician_reviews_count: tech_reviews.count,
            company_reviews_count: company_reviews.count
          }, status: :ok
        end

        def update_flag
          flag = ReviewFlag.find(params[:id])
          status = params[:status].to_s
          unless ReviewFlag.statuses.key?(status)
            return render json: { error: "Invalid status" }, status: :unprocessable_entity
          end

          flag.update!(
            status: status,
            reviewed_by: @current_user,
            reviewed_at: Time.current,
            review_notes: params[:review_notes].presence
          )

          render json: { message: "Flag updated", flag_id: flag.id, status: flag.status }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Flag not found" }, status: :not_found
        end

        private

        def limit_param
          value = params[:limit].to_i
          return 100 if value <= 0
          [value, 500].min
        end

        def average_for_type(type)
          scope = Rating.where(reviewee_type: type).where.not(moderation_status: :hidden)
          return nil if scope.count.zero?
          (scope.sum(:score) / scope.count.to_f).round(2)
        end

        def review_completion_rate
          finished_jobs = Job.where(status: :finished)
          total = finished_jobs.count
          return 0.0 if total.zero?

          both_sides = finished_jobs.joins(:ratings)
            .group("jobs.id")
            .having("COUNT(DISTINCT ratings.reviewer_type) = 2")
            .count
            .size
          ((both_sides.to_f / total) * 100).round(1)
        end

        def recommendation_rate
          scoped = Rating.where.not(would_recommend: nil).where.not(moderation_status: :hidden)
          return nil if scoped.count.zero?
          ((scoped.where(would_recommend: true).count.to_f / scoped.count) * 100).round(1)
        end

        def response_rate
          tech_yes = Rating.where.not(would_work_again: nil).where(would_work_again: true).count
          tech_total = Rating.where.not(would_work_again: nil).count
          return nil if tech_total.zero?
          ((tech_yes.to_f / tech_total) * 100).round(1)
        end

        def repeat_hire_rate
          repeated_pairs = Rating.group(:reviewer_type, :reviewer_id, :reviewee_type, :reviewee_id).having("COUNT(*) > 1").count
          total_pairs = Rating.group(:reviewer_type, :reviewer_id, :reviewee_type, :reviewee_id).count.size
          return 0.0 if total_pairs.zero?

          ((repeated_pairs.size.to_f / total_pairs) * 100).round(1)
        end

        def top_entities_for(type)
          ids = Rating.where(reviewee_type: type).where.not(moderation_status: :hidden)
            .group(:reviewee_id)
            .order(Arel.sql("AVG(score) DESC"))
            .limit(5)
            .pluck(:reviewee_id)
          return [] if ids.empty?

          records = if type == "TechnicianProfile"
            TechnicianProfile.includes(:user).where(id: ids)
          else
            CompanyProfile.where(id: ids)
          end
          records.map do |record|
            {
              id: record.id,
              label: type == "TechnicianProfile" ? (record.user&.email || "Technician ##{record.id}") : (record.company_name || "Company ##{record.id}"),
              average_rating: Rating.average_for(record),
              review_count: Rating.where(reviewee: record).count
            }
          end
        end
      end
    end
  end
end
