class JobSerializer < ActiveModel::Serializer
  attributes :id, :title, :description, :required_documents, :required_certifications, :location, :status, :company_profile_id, :created_at, :updated_at, :timeline,
             :scheduled_start_at, :scheduled_end_at, :finished_at, :price_cents, :hourly_rate_cents, :hours_per_day, :days,
             :job_amount_cents, :company_charge_cents, :tech_payout_cents,
             :address, :city, :state, :zip_code, :country, :latitude, :longitude,
             :skill_class, :minimum_years_experience, :notes

  belongs_to :company_profile
  has_many :job_applications
end 