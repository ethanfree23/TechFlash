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

  def make_job(company:, funding:, with_collection: false, labor: 80_000, days: nil)
    days ||= (labor.positive? ? 1 : 0)
    job = Job.create!(
      company_profile: company,
      title: "Reclass job",
      description: "desc",
      status: :open,
      funding_status: funding,
      settlement_status: :unsettled,
      hourly_rate_cents: labor.positive? ? 10_000 : 0,
      hours_per_day: labor.positive? ? 8 : 0,
      days: days,
      agreed_labor_cents: labor,
      company_commission_percent_snapshot: labor.positive? ? 10 : nil,
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

  test "category A verified waiver candidates propose correction and do not write" do
    mislabeled = make_job(company: @waived_company, funding: :funded)
    with_money = make_job(company: @paid_company, funding: :funded, with_collection: true)
    unpriced = make_job(company: @waived_company, funding: :funded, labor: 0)

    ENV.delete("CONFIRM")
    out = capture_io { @task.invoke }.first

    assert_match(/DRY-RUN/, out)
    assert_match(/CATEGORY A/, out)
    assert_match(/job_id: #{mislabeled.id}/, out)
    assert_match(/category: A/, out)
    assert_match(/funding_status: funded -> unfunded/, out)
    assert_match(/posted_under_funding_waiver: false -> true/, out)
    refute_match(/job_id: #{with_money.id}/, out)
    refute_match(/job_id: #{unpriced.id}/, out)
    assert mislabeled.reload.funding_funded?
    assert_equal "open", mislabeled.status
  ensure
    ENV.delete("CONFIRM")
  end

  test "category B inconsistent stamps do not propose invented waiver" do
    inconsistent = make_job(company: @paid_company, funding: :funded)

    ENV.delete("CONFIRM")
    out = capture_io { @task.invoke }.first

    assert_match(/CATEGORY B/, out)
    assert_match(/job_id: #{inconsistent.id}/, out)
    assert_match(/category: B/, out)
    assert_match(/do NOT invent posted_under_funding_waiver/i, out)
    refute_match(/posted_under_funding_waiver: false -> true/, out)
    assert inconsistent.reload.funding_funded?
    refute inconsistent.posted_under_funding_waiver?
  ensure
    ENV.delete("CONFIRM")
  end

  test "CONFIRM=1 is refused and never writes" do
    mislabeled = make_job(company: @waived_company, funding: :funded)

    ENV["CONFIRM"] = "1"
    assert_raises(SystemExit) { capture_io { @task.invoke } }
    assert mislabeled.reload.funding_funded?
    refute mislabeled.posted_under_funding_waiver?
  ensure
    ENV.delete("CONFIRM")
  end

  test "already corrected rows are not candidates" do
    job = make_job(company: @waived_company, funding: :unfunded)
    job.update!(posted_under_funding_waiver: true)

    ENV.delete("CONFIRM")
    out = capture_io { @task.invoke }.first
    assert_match(/No candidates found/i, out)
    assert job.reload.funding_unfunded?
    assert job.posted_under_funding_waiver?
  end

  test "jobs with succeeded collections are left unchanged" do
    paid = make_job(company: @waived_company, funding: :funded, with_collection: true)
    ENV.delete("CONFIRM")
    out = capture_io { @task.invoke }.first
    refute_match(/job_id: #{paid.id}/, out)
    assert paid.reload.funding_funded?
  ensure
    ENV.delete("CONFIRM")
  end
end
