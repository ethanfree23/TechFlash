class ReferralRewardMarker
  def self.mark_for_finished_job!(job)
    new(job).call
  end

  def initialize(job)
    @job = job
  end

  def call
    return unless @job&.finished?

    referred_users = [company_user, technician_user].compact
    return if referred_users.empty?

    referred_users.each do |user|
      referrals_for_user(user).find_each do |referral|
        referral.update!(referred_user: user, reward_eligible_at: Time.current)
      end
    end
  end

  private

  def company_user
    @job.company_profile&.user
  end

  def technician_user
    accepted = @job.job_applications.find_by(status: :accepted)
    accepted&.technician_profile&.user
  end

  def referrals_for_user(user)
    email = user.email.to_s.downcase.strip
    ReferralSubmission.reward_pending.where(
      "referred_user_id = :id OR LOWER(email) = :email",
      id: user.id,
      email: email
    )
  end
end
