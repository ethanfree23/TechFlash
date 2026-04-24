require "jwt"

results = []
result_file = Rails.root.join("tmp", "referral_smoke_test_result.txt")

ActiveRecord::Base.transaction do
  ts = Time.now.to_i
  referrer = User.create!(
    email: "referrer_#{ts}@example.com",
    password: "Passw0rd!",
    password_confirmation: "Passw0rd!",
    role: :technician
  )
  TechnicianProfile.create!(user: referrer, trade_type: "General", experience_years: 1, availability: "Full-time")

  referred = User.create!(
    email: "referredbiz_#{ts}@example.com",
    password: "Passw0rd!",
    password_confirmation: "Passw0rd!",
    role: :company
  )
  company_profile = CompanyProfile.create!(
    user: referred,
    company_name: "Referral Biz LLC",
    industry: "Construction",
    location: "Austin"
  )

  token = JWT.encode({ user_id: referrer.id }, Rails.application.secret_key_base)
  app = ActionDispatch::Integration::Session.new(Rails.application)
  app.host! "localhost"
  headers = {
    "Authorization" => "Token token=#{token}",
    "Content-Type" => "application/json"
  }

  payload = {
    first_name: "Rita",
    last_name: "Lead",
    cell_phone: "555-111-2222",
    referred_type: "biz",
    email: referred.email,
    location: "Austin",
    extra_info: "Smoke test referral"
  }

  app.post("/api/v1/referrals", params: payload.to_json, headers: headers)
  results << "referral_status=#{app.response.status}"
  results << "referral_response_body=#{app.response.body}"

  referral = ReferralSubmission.order(:id).last
  results << "referral_created=#{referral.present?}"
  results << "crm_linked=#{referral && referral.crm_lead_id.present?}"
  results << "crm_tagged=#{referral && referral.crm_lead && referral.crm_lead.notes.to_s.include?('[Referral]')}"

  feedback = FeedbackSubmission.where(user_id: referrer.id, kind: "referral").order(:id).last
  results << "admin_message_created=#{feedback.present?}"

  job = Job.create!(
    company_profile: company_profile,
    title: "Referral Test Job",
    description: "Smoke test",
    location: "Austin",
    status: :open
  )

  company_token = JWT.encode({ user_id: referred.id }, Rails.application.secret_key_base)
  company_headers = {
    "Authorization" => "Token token=#{company_token}",
    "Content-Type" => "application/json"
  }
  app.patch("/api/v1/jobs/#{job.id}/finish", params: {}.to_json, headers: company_headers)
  results << "finish_status=#{app.response.status}"
  results << "finish_response_body=#{app.response.body}"

  if referral
    referral.reload
    results << "reward_eligible=#{referral.reward_eligible_at.present?}"
  else
    results << "reward_eligible=skipped_no_referral"
  end

  File.write(result_file, results.join("\n"))
  raise ActiveRecord::Rollback
end
