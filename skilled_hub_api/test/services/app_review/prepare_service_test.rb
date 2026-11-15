# frozen_string_literal: true

require "test_helper"

module AppReview
  class PrepareServiceTest < ActiveSupport::TestCase
    setup do
      User.where(email: [PrepareService::COMPANY_EMAIL, PrepareService::TECH_EMAIL]).find_each do |u|
        u.company_profile&.destroy
        u.technician_profile&.destroy
        u.destroy!
      end

      @company_user = User.create!(
        email: PrepareService::COMPANY_EMAIL,
        password: "password123",
        password_confirmation: "password123",
        role: :company,
        first_name: "Apple",
        last_name: "Reviewer"
      )
      @company = CompanyProfile.create!(
        user: @company_user,
        company_name: "Review Co",
        industry: "Electrician",
        membership_level: "basic",
        phone: "7135550101",
        job_funding_waived: false
      )
      @company_user.update_column(:company_profile_id, @company.id)

      @tech_user = User.create!(
        email: PrepareService::TECH_EMAIL,
        password: "password123",
        password_confirmation: "password123",
        role: :technician,
        first_name: "Taylor",
        last_name: "Reviewer"
      )
      @tech = TechnicianProfile.create!(
        user: @tech_user,
        trade_type: "Electrician",
        skill_class: "journeyman",
        availability: "Full-time",
        membership_level: "basic",
        experience_years: 1,
        phone: "7135550102",
        city: "Houston",
        state: "TX"
      )
    end

    test "prepare is idempotent and makes demo job claimable without stripe" do
      first = PrepareService.call!
      second = PrepareService.call!

      assert first.claimable, first.warnings.inspect
      assert second.claimable, second.warnings.inspect
      assert_equal first.job_id, second.job_id
      assert_equal first.conversation_id, second.conversation_id

      job = Job.find(first.job_id)
      assert_equal "open", job.status
      assert job.posted_under_funding_waiver?
      assert job.funding_allows_claim?
      assert_nil job.hourly_rate_cents
      assert job.go_live_at <= 2.days.ago

      @tech.reload
      assert_equal "premium", @tech.membership_level
      assert @tech.membership_fee_waived?
      assert @company.reload.job_funding_waived?

      assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: @tech)
    end

    test "prepare clears mutual blocks and reopens a previously claimed demo job" do
      result = PrepareService.call!
      job = Job.find(result.job_id)
      JobApplication.create!(job: job, technician_profile: @tech, status: :accepted)
      job.update!(status: :filled)
      @tech_user.update_blocked_user_ids!([@company_user.id])
      @company_user.update_blocked_user_ids!([@tech_user.id])

      again = PrepareService.call!
      job.reload
      assert_equal again.job_id, result.job_id
      assert_equal "open", job.status
      assert again.claimable, again.warnings.inspect
      refute @tech_user.reload.blocked_user?(@company_user.id)
      refute @company_user.reload.blocked_user?(@tech_user.id)
      refute JobApplication.where(job_id: job.id, technician_profile_id: @tech.id, status: :accepted).exists?
    end

    test "prepare does not touch unrelated jobs" do
      other = Job.create!(
        company_profile: @company,
        title: "Customer live job",
        description: "do not touch",
        status: :open,
        trade_type: "Electrician",
        skill_class: "journeyman",
        pay_basis: :actual_hours_worked,
        hourly_rate_cents: 10_000,
        hours_per_day: 8,
        days: 1,
        scheduled_start_at: 2.days.from_now,
        scheduled_end_at: 3.days.from_now,
        go_live_at: Time.current,
        posted_under_funding_waiver: true,
        funding_status: :funded
      )

      PrepareService.call!
      other.reload
      assert_equal "Customer live job", other.title
      assert_equal 10_000, other.hourly_rate_cents
    end
  end
end
