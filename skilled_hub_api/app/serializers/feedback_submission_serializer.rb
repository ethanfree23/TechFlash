class FeedbackSubmissionSerializer < ActiveModel::Serializer
  attributes :id, :kind, :body, :page_path, :created_at, :updated_at,
             :user_email, :user_role

  def user_email
    object.user&.email
  end

  def user_role
    object.user&.role
  end
end
