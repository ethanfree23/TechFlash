class UserSerializer < ActiveModel::Serializer
  attributes :id, :email, :role, :company_profile_id, :membership_level, :created_at, :updated_at

  def company_profile_id
    object.company_profile&.id
  end

  def membership_level
    if object.company?
      MembershipPolicy.normalized_level(object.company_profile&.membership_level)
    elsif object.technician?
      MembershipPolicy.normalized_level(object.technician_profile&.membership_level)
    end
  end
end 