class JobTemplateSerializer < ActiveModel::Serializer
  attributes :id, :name, :company_profile_id, :created_by_user_id, :trade_type, :skill_class,
             :configuration, :use_count, :last_used_at, :created_at, :updated_at,
             :duration_days, :working_days, :schedule_start_time

  def configuration
    object.configuration_hash
  end

  def duration_days
    object.duration_days
  end

  def working_days
    object.working_days
  end

  def schedule_start_time
    object.schedule_start_time
  end
end
