class UserSerializer < ActiveModel::Serializer
  attributes :id, :email, :role, :company_profile_id, :created_at, :updated_at

  def company_profile_id
    object.company_profile&.id
  end
end 