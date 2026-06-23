module Api
  module V1
    class RatingsController < ApplicationController
      before_action :authenticate_user
      before_action :require_admin, only: [:moderation_queue, :hide, :restore]

      def review_categories
        type = params[:as] == 'technician' ? 'TechnicianProfile' : 'CompanyProfile'
        categories = Rating.categories_for(type)
        render json: { categories: categories }
      end

      def reviewed_job_ids
        reviewer = nil
        reviewer = @current_user.technician_profile if @current_user.technician?
        reviewer = @current_user.company_profile if @current_user.company?
        job_ids = reviewer ? Rating.where(reviewer: reviewer).pluck(:job_id).uniq : []
        render json: { job_ids: job_ids }
      end

      def index
        ratings = Rating.all
        ratings = ratings.where(job_id: params[:job_id]) if params[:job_id].present?
        ratings = ratings.where.not(moderation_status: :hidden) unless @current_user.admin?

        other_party_has_reviewed = nil
        current_reviewer = nil
        job = nil
        current_user_has_reviewed = false

        # Double-blind visibility: hide counterparty review until both submit or review window expires.
        if params[:job_id].present?
          job = Job.find_by(id: params[:job_id])
          if job&.finished?
            company_profile = job.company_profile
            accepted_app = job.job_applications.find_by(status: :accepted)
            technician_profile = accepted_app&.technician_profile

            current_reviewer = company_profile if @current_user.company? && company_profile&.id == @current_user.company_profile&.id
            current_reviewer = technician_profile if @current_user.technician? && technician_profile&.user_id == @current_user.id

            if current_reviewer
              other_reviewer = current_reviewer.is_a?(CompanyProfile) ? technician_profile : company_profile
              other_party_has_reviewed = other_reviewer ? Rating.exists?(job: job, reviewer: other_reviewer) : false

              current_user_has_reviewed = Rating.exists?(job: job, reviewer: current_reviewer)
              review_window_expired = job.finished_at.nil? || job.finished_at <= Rating.review_window_duration.ago

              unless current_user_has_reviewed || review_window_expired
                # Hide the other party's review - only show current user's own review (if any)
                ratings = ratings.where(reviewer: current_reviewer)
              end
            end
          end
        end

        if params[:job_id].present? && other_party_has_reviewed != nil
          serialized = ratings.map { |r| RatingSerializer.new(r).serializable_hash }
          render json: {
            ratings: serialized,
            other_party_has_reviewed: other_party_has_reviewed,
            current_user_has_reviewed: current_user_has_reviewed,
            review_window_days: Rating::REVIEW_WINDOW_DAYS
          }, status: :ok
        else
          render json: ratings, each_serializer: RatingSerializer, status: :ok
        end
      end
      
      def show
        rating = Rating.find(params[:id])
        render json: rating, serializer: RatingSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Rating not found" }, status: :not_found
      end

      def create
        rp = rating_params
        job_id = rp[:job_id] || params[:job_id] || params.dig(:rating, :job_id)
        job = Job.find(job_id)
        unless job.finished?
          return render json: { error: "Can only review completed jobs" }, status: :unprocessable_entity
        end
        if job.finished_at.present? && job.finished_at < Rating.review_window_duration.ago
          return render json: { error: "Review window has expired for this job" }, status: :unprocessable_entity
        end

        company_profile = job.company_profile
        accepted_app = job.job_applications.find_by(status: :accepted)
        technician_profile = accepted_app&.technician_profile

        unless technician_profile
          return render json: { error: "Job has no claimed technician" }, status: :unprocessable_entity
        end

        reviewer, reviewee = nil, nil
        if @current_user.company? && company_profile.id == @current_user.company_profile&.id
          reviewer = company_profile
          reviewee = technician_profile
        elsif @current_user.technician? && technician_profile.user_id == @current_user.id
          reviewer = technician_profile
          reviewee = company_profile
        else
          return render json: { error: "You must be the company or technician for this job to leave a review" }, status: :forbidden
        end

        existing = Rating.find_by(job: job, reviewer: reviewer)
        if existing
          return render json: { error: "You have already reviewed for this job" }, status: :unprocessable_entity
        end

        category_scores = rp[:category_scores].presence || params[:category_scores].presence || params.dig(:rating, :category_scores)
        score = rp[:score]&.to_i

        if category_scores.present? && category_scores.respond_to?(:to_h)
          category_scores = category_scores.to_h.transform_keys(&:to_s)
          expected_keys = reviewer.is_a?(CompanyProfile) ? Rating::COMPANY_REVIEW_CATEGORIES.keys.map(&:to_s) : Rating::TECH_REVIEW_CATEGORIES.keys.map(&:to_s)
          unless (expected_keys - category_scores.keys).empty?
            return render json: { error: "All category scores are required" }, status: :unprocessable_entity
          end
          unless category_scores.values.all? { |v| v.to_i.between?(1, 5) }
            return render json: { error: "Each category score must be 1-5" }, status: :unprocessable_entity
          end
          attrs = {
            job: job,
            reviewer: reviewer,
            reviewee: reviewee,
            comment: rp[:comment],
            category_scores: category_scores
          }
        elsif score.present? && score.between?(1, 5)
          attrs = {
            job: job,
            reviewer: reviewer,
            reviewee: reviewee,
            score: score,
            comment: rp[:comment]
          }
        else
          return render json: { error: "Either category_scores (all categories 1-5) or score (1-5) is required" }, status: :unprocessable_entity
        end

        attrs.merge!(role_specific_answer_attrs(reviewer: reviewer, params_hash: rp))
        rating = Rating.new(attrs)

        if rating.save
          update_double_blind_visibility!(job)
          run_basic_fraud_checks!(rating)
          MailDelivery.safe_deliver { UserMailer.review_received_email(rating).deliver_now }
          PaymentService.release_if_eligible(job)
          render json: rating, serializer: RatingSerializer, status: :created
        else
          render json: { errors: rating.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def moderation_queue
        ratings = Rating.where.not(moderation_status: :active).order(updated_at: :desc).limit(200)
        render json: ratings, each_serializer: RatingSerializer, status: :ok
      end

      def hide
        rating = Rating.find(params[:id])
        rating.update!(
          moderation_status: :hidden,
          hidden_at: Time.current,
          hidden_by_user_id: @current_user.id,
          moderation_notes: params[:notes].presence
        )
        render json: rating, serializer: RatingSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Rating not found" }, status: :not_found
      end

      def restore
        rating = Rating.find(params[:id])
        rating.update!(
          moderation_status: :active,
          hidden_at: nil,
          hidden_by_user_id: nil,
          moderation_notes: params[:notes].presence
        )
        render json: rating, serializer: RatingSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Rating not found" }, status: :not_found
      end

      private

      def rating_params
        source = params[:rating].presence || params
        source.permit(
          :job_id,
          :score,
          :comment,
          :would_hire_again,
          :would_recommend,
          :on_time_status,
          :request_again,
          :would_work_again,
          :payment_on_time,
          :job_description_match,
          category_scores: {}
        )
      end

      def role_specific_answer_attrs(reviewer:, params_hash:)
        attrs = {}
        if reviewer.is_a?(CompanyProfile)
          attrs[:would_hire_again] = parse_nullable_boolean(params_hash[:would_hire_again])
          attrs[:would_recommend] = parse_nullable_boolean(params_hash[:would_recommend])
          attrs[:request_again] = parse_nullable_boolean(params_hash[:request_again])
          attrs[:on_time_status] = params_hash[:on_time_status]
        else
          attrs[:would_work_again] = parse_nullable_boolean(params_hash[:would_work_again])
          attrs[:payment_on_time] = parse_nullable_boolean(params_hash[:payment_on_time])
          attrs[:job_description_match] = params_hash[:job_description_match]
        end
        attrs
      end

      def parse_nullable_boolean(value)
        return nil if value.nil?
        ActiveModel::Type::Boolean.new.cast(value)
      end

      def update_double_blind_visibility!(job)
        company_review = Rating.find_by(job: job, reviewer_type: "CompanyProfile")
        technician_review = Rating.find_by(job: job, reviewer_type: "TechnicianProfile")
        now = Time.current

        if company_review && technician_review
          Rating.where(id: [company_review.id, technician_review.id]).update_all(visible_at: now, updated_at: now)
        else
          Rating.where(job_id: job.id, visible_at: nil).update_all(
            visible_at: job.finished_at.present? ? (job.finished_at + Rating.review_window_duration) : (now + Rating.review_window_duration),
            updated_at: now
          )
        end
      end

      def run_basic_fraud_checks!(rating)
        reasons = []
        pair_count = Rating.where(
          reviewer_type: rating.reviewer_type,
          reviewer_id: rating.reviewer_id,
          reviewee_type: rating.reviewee_type,
          reviewee_id: rating.reviewee_id
        ).where("created_at >= ?", 90.days.ago).count

        reasons << { reason: "repeat_pair_high_volume", risk_score: 75, details: { pair_count_90d: pair_count } } if pair_count >= 5

        duplicate_comment = Rating.where(reviewer: rating.reviewer)
          .where("created_at >= ?", 30.days.ago)
          .where(comment: rating.comment.to_s.strip)
          .where.not(id: rating.id)
          .exists?
        reasons << { reason: "duplicate_comment_pattern", risk_score: 60, details: {} } if duplicate_comment

        return if reasons.empty?

        reasons.each do |payload|
          ReviewFlag.create!(
            rating: rating,
            reason: payload[:reason],
            risk_score: payload[:risk_score],
            details: payload[:details]
          )
        end
        rating.update!(moderation_status: :flagged)
      end
    end
  end
end 