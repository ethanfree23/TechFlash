# frozen_string_literal: true

require "test_helper"
ENV["HSI_RECLASSIFY_SKIP_AUTO_RUN"] = "1"
require Rails.root.join("script/one_off/hsi_reclassify_32_38")

class HsiReclassify3238Test < ActiveSupport::TestCase
  EXPECTED_LABOR = 1_040_000
  EXPECTED_REQUIRED = 1_144_000

  setup do
    @out = StringIO.new
    @company_user = User.create!(
      email: "hsi-reclass-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @company = CompanyProfile.create!(
      user: @company_user,
      membership_level: "basic",
      phone: "713-555-0100",
      job_funding_waived: true,
      company_name: "HSI Test Co"
    )
    @company_user.update_column(:company_profile_id, @company.id)

    @admin = User.create!(
      email: "hsi-reclass-admin-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin
    )

    @jobs = 7.times.map { build_hsi_like_job }
    @job_ids = @jobs.map(&:id)
  end

  def build_hsi_like_job
    Job.create!(
      company_profile: @company,
      title: "HSI reclass fixture",
      description: "desc",
      status: :open,
      funding_status: :funded,
      settlement_status: :unsettled,
      posted_under_funding_waiver: false,
      financial_revision: 1,
      pay_basis: :guaranteed_job_pay,
      hourly_rate_cents: 10_000,
      hours_per_day: 8,
      days: 13,
      agreed_labor_cents: EXPECTED_LABOR,
      company_commission_percent_snapshot: 10,
      go_live_at: Time.current
    )
  end

  def run_script(apply:, **extra)
    OneOff::HsiReclassify3238.run!(
      job_ids: @job_ids,
      company_profile_id: @company.id,
      expected_required_cents: EXPECTED_REQUIRED,
      expected_labor_cents: EXPECTED_LABOR,
      apply: apply,
      operator_user_id: @admin.id,
      authorization_note: "owner-authorized test HSI reclassify",
      git_sha: "testsha123",
      stdout: @out,
      **extra
    )
  end

  # --- (a) happy path ----------------------------------------------------------

  test "APPLY happy path updates only funding fields and writes JobTermChangeAudit" do
    ledger = JobLedger.for(@jobs.first)
    assert_equal EXPECTED_REQUIRED, ledger.company_required_cents
    assert_equal EXPECTED_LABOR, ledger.labor_cents
    refute ledger.fully_funded
    assert_equal 0, ledger.net_funded_cents

    before_updated_ats = @jobs.map { |j| j.reload.updated_at }

    result = run_script(apply: true)
    assert result.apply
    assert_equal [], result.guard_failures
    assert_equal 7, result.updated.size
    assert_equal 7, result.audits.size
    assert result.verification["ok"]

    @jobs.each_with_index do |job, idx|
      job.reload
      assert job.funding_unfunded?, "job #{job.id} funding"
      assert job.posted_under_funding_waiver?
      assert_equal "open", job.status
      assert_equal "unsettled", job.settlement_status
      assert_equal 1, job.financial_revision
      assert_equal EXPECTED_LABOR, job.agreed_labor_cents
      assert job.updated_at >= before_updated_ats[idx]

      audit = JobTermChangeAudit.find_by!(job_id: job.id, change_type: OneOff::HsiReclassify3238::CHANGE_TYPE)
      assert_equal @admin.id, audit.actor_user_id
      assert_match(/owner-authorized/, audit.reason)
      assert_match(/git_sha=testsha123/, audit.reason)
      assert_equal "funded", audit.previous_values["funding_status"]
      assert_equal false, audit.previous_values["posted_under_funding_waiver"]
      assert_equal "unfunded", audit.new_values["funding_status"]
      assert_equal true, audit.new_values["posted_under_funding_waiver"]
      assert audit.new_values["verification"].is_a?(Hash)
      assert audit.new_values["verification"]["ok"]
    end

    assert_equal 0, JobPaymentTransaction.where(job_id: @job_ids).count
    assert_equal 0, PaymentRiskEvent.where(job_id: @job_ids).count
  end

  # --- (b) failing guard → full rollback --------------------------------------

  test "APPLY aborts and rolls back all jobs and audits when one guard fails" do
    tainted = @jobs[3]
    tainted.update_columns(financial_revision: 2)

    assert_raises(OneOff::HsiReclassify3238::GuardFailure) do
      run_script(apply: true)
    end

    @jobs.each do |job|
      job.reload
      if job.id == tainted.id
        assert_equal 2, job.financial_revision
      else
        assert_equal 1, job.financial_revision
      end
      assert job.funding_funded?, "job #{job.id} must remain funded after rollback"
      refute job.posted_under_funding_waiver?
      assert_equal 0, JobTermChangeAudit.where(job_id: job.id, change_type: OneOff::HsiReclassify3238::CHANGE_TYPE).count
    end
  end

  # --- (c) dry-run writes nothing ---------------------------------------------

  test "dry-run without APPLY writes nothing and reports guards" do
    result = run_script(apply: false)
    refute result.apply
    assert_equal "dry_run", result.mode
    assert_equal [], result.guard_failures
    assert_match(/DRY-RUN/, @out.string)
    assert_match(/GUARDS: PASS/, @out.string)

    @jobs.each do |job|
      job.reload
      assert job.funding_funded?
      refute job.posted_under_funding_waiver?
      assert_equal 0, JobTermChangeAudit.where(job_id: job.id, change_type: OneOff::HsiReclassify3238::CHANGE_TYPE).count
    end
  end

  test "ENV APPLY gate requires exact YES_HSI_32_38 token" do
    previous = ENV["APPLY"]
    ENV["APPLY"] = "YES"
    result = OneOff::HsiReclassify3238.run!(
      job_ids: @job_ids,
      company_profile_id: @company.id,
      expected_required_cents: EXPECTED_REQUIRED,
      expected_labor_cents: EXPECTED_LABOR,
      # apply omitted → resolve from ENV
      operator_user_id: @admin.id,
      authorization_note: "note",
      git_sha: "sha",
      stdout: @out
    )
    refute result.apply
    assert_equal "dry_run", result.mode
  ensure
    if previous.nil?
      ENV.delete("APPLY")
    else
      ENV["APPLY"] = previous
    end
  end

  test "explicit apply: true raises outside Rails.env.test?" do
    Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
      err = assert_raises(OneOff::HsiReclassify3238::GuardFailure) do
        OneOff::HsiReclassify3238.run!(
          job_ids: @job_ids,
          company_profile_id: @company.id,
          expected_required_cents: EXPECTED_REQUIRED,
          expected_labor_cents: EXPECTED_LABOR,
          apply: true,
          operator_user_id: @admin.id,
          authorization_note: "note",
          git_sha: "sha",
          stdout: @out
        )
      end
      assert_match(/refused outside Rails\.env\.test/i, err.message)
    end

    @jobs.each do |job|
      job.reload
      assert job.funding_funded?
      refute job.posted_under_funding_waiver?
    end
  end

  test "ENV APPLY token enables write when apply omitted" do
    previous = ENV["APPLY"]
    ENV["APPLY"] = OneOff::HsiReclassify3238::APPLY_TOKEN
    result = OneOff::HsiReclassify3238.run!(
      job_ids: @job_ids,
      company_profile_id: @company.id,
      expected_required_cents: EXPECTED_REQUIRED,
      expected_labor_cents: EXPECTED_LABOR,
      operator_user_id: @admin.id,
      authorization_note: "owner-authorized via ENV token",
      git_sha: "envsha",
      stdout: @out
    )
    assert result.apply
    @jobs.each do |job|
      job.reload
      assert job.funding_unfunded?
      assert job.posted_under_funding_waiver?
    end
  ensure
    if previous.nil?
      ENV.delete("APPLY")
    else
      ENV["APPLY"] = previous
    end
  end

  test "accepted claim guard blocks APPLY" do
    tech_user = User.create!(
      email: "hsi-tech-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    tech = TechnicianProfile.create!(
      user: tech_user,
      trade_type: "General",
      availability: "Full-time",
      membership_level: "basic"
    )
    JobApplication.create!(job: @jobs.first, technician_profile: tech, status: :accepted)

    err = assert_raises(OneOff::HsiReclassify3238::GuardFailure) { run_script(apply: true) }
    assert_match(/accepted claims|active assignment/i, err.message)

    @jobs.each do |job|
      job.reload
      assert job.funding_funded?
      refute job.posted_under_funding_waiver?
    end
  end
end
