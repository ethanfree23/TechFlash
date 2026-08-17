# frozen_string_literal: true

# Anonymous preview for share-token URLs — excludes coordinates, street address, payments, applicants, notes.
class PublicJobPreviewSerializer < ActiveModel::Serializer
  attributes :id,
             :title,
             :description,
             :required_documents,
             :required_certifications,
             :location,
             :city,
             :state,
             :country,
             :status,
             :effective_status,
             :scheduled_start_at,
             :scheduled_end_at,
             :finished_at,
             :hourly_rate_cents,
             :hours_per_day,
             :days,
             :price_cents,
             :skill_class,
             :minimum_years_experience,
             :go_live_at,
             :start_mode,
             :rolling_start_rule_type,
             :rolling_start_exact_start_at,
             :rolling_start_days_after_acceptance,
             :rolling_start_weekday,
             :rolling_start_weekday_time,
             :timeline,
             :created_at,
             :updated_at

  attribute :company_preview

  def company_preview
    cp = object.company_profile
    return nil unless cp

    { id: cp.id, company_name: cp.company_name }
  end
end
