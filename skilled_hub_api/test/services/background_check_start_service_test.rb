require "test_helper"

class BackgroundCheckStartServiceTest < ActiveSupport::TestCase
  test "reuses existing candidate when available" do
    user = User.create!(
      email: "bg-service-reuse@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Reuse",
      last_name: "Case"
    )
    TechnicianProfile.create!(
      user: user,
      trade_type: "HVAC",
      availability: "Full-time",
      membership_level: "basic",
      city: "Houston",
      state: "TX",
      country: "US",
      zip_code: "77002"
    )
    check = BackgroundCheck.create!(
      user: user,
      provider: "checkr",
      provider_candidate_id: "cand_reuse_1",
      package_name: "essential_plus",
      node_custom_id: "houston_node",
      payment_status: :paid,
      paid_by: "technician",
      status: :not_started
    )

    fake_client = build_client_double(
      get_candidate: { "id" => "cand_reuse_1" },
      create_invitation: { "id" => "inv_reuse_1", "invitation_url" => "http://example.test/inv/reuse" }
    )
    with_stubbed_checkr_client(fake_client) do
      BackgroundCheckStartService.launch_checkr_invitation!(check)
    end

    check.reload
    assert_equal "cand_reuse_1", check.provider_candidate_id
    assert_equal "inv_reuse_1", check.provider_invitation_id
    assert_equal "http://example.test/inv/reuse", check.invitation_url
  end

  test "creates candidate when none reusable" do
    user = User.create!(
      email: "bg-service-create@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Create",
      last_name: "Case"
    )
    TechnicianProfile.create!(
      user: user,
      trade_type: "HVAC",
      availability: "Full-time",
      membership_level: "basic",
      city: "Houston",
      state: "TX",
      country: "US",
      zip_code: "77003"
    )
    check = BackgroundCheck.create!(
      user: user,
      provider: "checkr",
      package_name: "essential_plus",
      payment_status: :paid,
      paid_by: "technician",
      status: :not_started
    )

    fake_client = build_client_double(
      create_candidate: { "id" => "cand_new_1" },
      create_invitation: { "id" => "inv_new_1", "invitation_url" => "http://example.test/inv/new" }
    )
    with_stubbed_checkr_client(fake_client) do
      BackgroundCheckStartService.launch_checkr_invitation!(check)
    end

    check.reload
    assert_equal "cand_new_1", check.provider_candidate_id
    assert_equal "inv_new_1", check.provider_invitation_id
    assert_equal "invitation_sent", check.normalized_status
  end

  test "retries with a fresh candidate when reused candidate has missing email" do
    user = User.create!(
      email: "bg-service-retry@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Retry",
      last_name: "Case"
    )
    TechnicianProfile.create!(
      user: user,
      trade_type: "HVAC",
      availability: "Full-time",
      membership_level: "basic",
      city: "Houston",
      state: "TX",
      country: "US",
      zip_code: "77004"
    )
    check = BackgroundCheck.create!(
      user: user,
      provider: "checkr",
      provider_candidate_id: "cand_stale_1",
      package_name: "essential_plus",
      payment_status: :paid,
      paid_by: "technician",
      status: :not_started
    )

    invitation_attempts = 0
    fake_client = Object.new
    fake_client.define_singleton_method(:configured?) { true }
    fake_client.define_singleton_method(:get_candidate) { |candidate_id:| { "id" => "cand_stale_1" } }
    fake_client.define_singleton_method(:create_candidate) do |user:, work_location:, custom_id:, zipcode:|
      { "id" => "cand_fresh_1" }
    end
    fake_client.define_singleton_method(:create_invitation) do |candidate_id:, package_name:, redirect_url:, work_location:, node_custom_id:|
      invitation_attempts += 1
      if invitation_attempts == 1
        raise CheckrClient::Error, "email is missing (400)"
      end
      { "id" => "inv_retry_1", "invitation_url" => "http://example.test/inv/retry" }
    end

    with_stubbed_checkr_client(fake_client) do
      BackgroundCheckStartService.launch_checkr_invitation!(check)
    end

    check.reload
    assert_equal 2, invitation_attempts
    assert_equal "cand_fresh_1", check.provider_candidate_id
    assert_equal "inv_retry_1", check.provider_invitation_id
    assert_equal "http://example.test/inv/retry", check.invitation_url
    assert_equal "invited", check.status
  end

  test "retries with a fresh candidate when new candidate invitation fails with missing email" do
    user = User.create!(
      email: "bg-service-retry-new@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Retry",
      last_name: "Fresh"
    )
    TechnicianProfile.create!(
      user: user,
      trade_type: "HVAC",
      availability: "Full-time",
      membership_level: "basic",
      city: "Houston",
      state: "TX",
      country: "US",
      zip_code: "77005"
    )
    check = BackgroundCheck.create!(
      user: user,
      provider: "checkr",
      package_name: "essential_plus",
      payment_status: :paid,
      paid_by: "technician",
      status: :not_started
    )

    invitation_attempts = 0
    create_candidate_calls = 0
    fake_client = Object.new
    fake_client.define_singleton_method(:configured?) { true }
    fake_client.define_singleton_method(:get_candidate) { |candidate_id:| raise CheckrClient::Error, "missing" }
    fake_client.define_singleton_method(:create_candidate) do |user:, work_location:, custom_id:, zipcode:|
      create_candidate_calls += 1
      { "id" => "cand_new_retry_#{create_candidate_calls}" }
    end
    fake_client.define_singleton_method(:create_invitation) do |candidate_id:, package_name:, redirect_url:, work_location:, node_custom_id:|
      invitation_attempts += 1
      if invitation_attempts == 1
        raise CheckrClient::Error, "email is missing (400)"
      end
      { "id" => "inv_retry_new_1", "invitation_url" => "http://example.test/inv/retry-new" }
    end

    with_stubbed_checkr_client(fake_client) do
      BackgroundCheckStartService.launch_checkr_invitation!(check)
    end

    check.reload
    assert_equal 2, invitation_attempts
    assert_equal 2, create_candidate_calls
    assert_equal "cand_new_retry_2", check.provider_candidate_id
    assert_equal "inv_retry_new_1", check.provider_invitation_id
    assert_equal "http://example.test/inv/retry-new", check.invitation_url
    assert_equal "invited", check.status
  end

  private

  def build_client_double(create_candidate: nil, create_invitation:, get_candidate: nil)
    Object.new.tap do |client|
      client.define_singleton_method(:configured?) { true }
      client.define_singleton_method(:get_candidate) { |candidate_id:| raise CheckrClient::Error, "missing" if get_candidate.nil?; get_candidate }
      client.define_singleton_method(:create_candidate) do |user:, work_location:, custom_id:, zipcode:|
        raise "expected create_candidate call" if create_candidate.nil?
        raise "missing custom_id" if custom_id.blank?
        raise "missing city" if work_location[:city].blank?
        create_candidate
      end
      client.define_singleton_method(:create_invitation) do |candidate_id:, package_name:, redirect_url:, work_location:, node_custom_id:|
        raise "missing candidate_id" if candidate_id.blank?
        raise "missing package_name" if package_name.blank?
        raise "missing location country" if work_location[:country].blank?
        create_invitation
      end
    end
  end

  def with_stubbed_checkr_client(fake_client)
    original_new = CheckrClient.method(:new)
    CheckrClient.singleton_class.send(:define_method, :new) { fake_client }
    yield
  ensure
    CheckrClient.singleton_class.send(:define_method, :new, original_new)
  end
end
