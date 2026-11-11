# frozen_string_literal: true

require "test_helper"
require "rake"

class ReclassifyWaivedFundingRakeTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks if Rake::Task.tasks.empty?
    @task = Rake::Task["jobs:reclassify_waived_funding"]
    @task.reenable

    @waived_user = User.create!(
      email: "reclass-waived-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @waived_company = CompanyProfile.create!(
      user: @waived_user,
      membership_level: "basic",
      job_funding_waived: true
    )
    @waived_user.update_column(:company_profile_id, @waived_company.id)

    @paid_user = User.create!(
      email: "reclass-paid-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @paid_company = CompanyProfile.create!(
      user: @paid_user,
      membership_level: "basic",
      job_funding_waived: false
    )
    @paid_user.update_column(:company_profile_id, @paid_company.id)
  end

  def make_job(company:, funding:, with_collection: false, labor: 80_000)
    job = Job.create!(
      company_profile: company,
      title: "Reclass job",
      description: "desc",
      status: :open,
      funding_status: funding,
      hourly_rate_cents: 10_000,
      hours_per_day: 8,
      days: labor.positive? ? 1 : 0,
      agreed_labor_cents: labor,
      company_commission_percent_snapshot: 10,
      go_live_at: Time.current
    )
    if with_collection
      payment = Payment.create!(job: job, amount_cents: 88_000, status: "held", currency: "usd")
      JobPaymentTransaction.create!(
        payment: payment,
        job: job,
        transaction_type: :initial_job_charge,
        direction: :inbound,
        amount_cents: 88_000,
        currency: "usd",
        status: :succeeded,
        idempotency_key: "tf_reclass_#{job.id}_#{SecureRandom.hex(4)}",
        revision: 1,
        succeeded_at: Time.current
      )
    end
    job
  end

  test "dry-run prints candidates and does not write" do
    mislabeled = make_job(company: @waived_company, funding: :funded)
    with_money = make_job(company: @paid_company, funding: :funded, with_collection: true)

    ENV.delete("CONFIRM")
    out = capture_io { @task.invoke }.first

    assert_match(/DRY-RUN/, out)
    assert_match(/job_id=#{mislabeled.id}/, out)
    refute_match(/job_id=#{with_money.id}/, out)
    assert mislabeled.reload.funding_funded?
    assert_equal "open", mislabeled.status
    assert with_money.reload.funding_funded?
  ensure
    ENV.delete("CONFIRM")
  end

  test "CONFIRM=1 reclassifies only waived zero-collection funded jobs and preserves status" do
    mislabeled = make_job(company: @waived_company, funding: :funded)
    with_money = make_job(company: @waived_company, funding: :funded, with_collection: true)
    normal = make_job(company: @paid_company, funding: :funded, with_collection: true)

    ENV["CONFIRM"] = "1"
    @task.reenable
    capture_io { @task.invoke }

    mislabeled.reload
    assert mislabeled.funding_unfunded?
    assert mislabeled.posted_under_funding_waiver?
    assert_equal "open", mislabeled.status
    assert with_money.reload.funding_funded?
    assert normal.reload.funding_funded?
  ensure
    ENV.delete("CONFIRM")
  end

  test "idempotent when already corrected" do
    job = make_job(company: @waived_company, funding: :unfunded)
    job.update!(posted_under_funding_waiver: true)

    ENV["CONFIRM"] = "1"
    out = capture_io { @task.invoke }.first
    assert_match(/No candidates|Updated 0/i, out)
    assert job.reload.funding_unfunded?
    assert job.posted_under_funding_waiver?
  ensure
    ENV.delete("CONFIRM")
  end
end
