class RatingSerializer < ActiveModel::Serializer
  attributes :id, :job_id, :score, :comment, :category_scores, :category_labels, :created_at, :updated_at,
             :reviewer_type, :reviewer_id, :reviewee_type, :reviewee_id,
             :would_hire_again, :would_recommend, :on_time_status, :request_again,
             :would_work_again, :payment_on_time, :job_description_match,
             :review_window_expires_at, :visible_at, :moderation_status

  def category_labels
    object.category_labels
  end
end 