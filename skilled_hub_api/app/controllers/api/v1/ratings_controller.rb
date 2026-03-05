module Api
  module V1
    class RatingsController < ApplicationController
      before_action :authenticate_user

      def review_categories
        type = params[:as] == 'technician' ? 'TechnicianProfile' : 'CompanyProfile'
        categories = Rating.categories_for(type)
        render json: { categories: categories }
      end

      def index
        ratings = Rating.all
        ratings = ratings.where(job_id: params[:job_id]) if params[:job_id].present?

        other_party_has_reviewed = nil

        # When fetching by job: hide the other party's review until current user has reviewed OR 7 days have passed
        if params[:job_id].present?
          job = Job.find_by(id: params[:job_id])
          if job&.finished?
            company_profile = job.company_profile
            accepted_app = job.job_applications.find_by(status: :accepted)
            technician_profile = accepted_app&.technician_profile

            current_reviewer = nil
            current_reviewer = company_profile if @current_user.company? && company_profile&.user_id == @current_user.id
            current_reviewer = technician_profile if @current_user.technician? && technician_profile&.user_id == @current_user.id

            if current_reviewer
              other_reviewer = current_reviewer.is_a?(CompanyProfile) ? technician_profile : company_profile
              other_party_has_reviewed = other_reviewer ? Rating.exists?(job: job, reviewer: other_reviewer) : false

              current_user_has_reviewed = Rating.exists?(job: job, reviewer: current_reviewer)
              seven_days_passed = job.finished_at.nil? || job.finished_at <= 7.days.ago

              unless current_user_has_reviewed || seven_days_passed
                # Hide the other party's review - only show current user's own review (if any)
                ratings = ratings.where(reviewer: current_reviewer)
              end
            end
          end
        end

        if params[:job_id].present? && other_party_has_reviewed != nil
          serialized = ratings.map { |r| RatingSerializer.new(r).serializable_hash }
          render json: { ratings: serialized, other_party_has_reviewed: other_party_has_reviewed }, status: :ok
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

        company_profile = job.company_profile
        accepted_app = job.job_applications.find_by(status: :accepted)
        technician_profile = accepted_app&.technician_profile

        unless technician_profile
          return render json: { error: "Job has no claimed technician" }, status: :unprocessable_entity
        end

        reviewer, reviewee = nil, nil
        if @current_user.company? && company_profile.user_id == @current_user.id
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
          attrs = { job: job, reviewer: reviewer, reviewee: reviewee, comment: rp[:comment], category_scores: category_scores }
        elsif score.present? && score.between?(1, 5)
          attrs = { job: job, reviewer: reviewer, reviewee: reviewee, score: score, comment: rp[:comment] }
        else
          return render json: { error: "Either category_scores (all categories 1-5) or score (1-5) is required" }, status: :unprocessable_entity
        end
        rating = Rating.new(attrs)

        if rating.save
          render json: rating, serializer: RatingSerializer, status: :created
        else
          render json: { errors: rating.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      private

      def rating_params
        source = params[:rating].presence || params
        source.permit(:job_id, :score, :comment, category_scores: {})
      end
    end
  end
end 