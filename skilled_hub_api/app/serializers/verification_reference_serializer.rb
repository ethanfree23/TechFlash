class VerificationReferenceSerializer < ActiveModel::Serializer
  attributes :id, :full_name, :email, :phone, :company_name, :relationship,
             :status, :requested_at, :responded_at, :reviewed_at, :review_notes,
             :answers, :created_at, :updated_at
end
