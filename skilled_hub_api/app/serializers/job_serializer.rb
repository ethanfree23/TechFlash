class JobSerializer < ActiveModel::Serializer
  attributes :id, :title, :description, :required_documents, :location, :status, :company_profile_id, :created_at, :updated_at, :timeline,
             :scheduled_start_at, :scheduled_end_at, :finished_at

  belongs_to :company_profile
  has_many :job_applications
end 