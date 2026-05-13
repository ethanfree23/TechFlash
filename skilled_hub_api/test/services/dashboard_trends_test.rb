# frozen_string_literal: true

require "test_helper"

class DashboardTrendsTest < ActiveSupport::TestCase
  test "admin_platform_trends returns 30 rows with expected keys" do
    rows = DashboardTrends.admin_platform_trends
    assert_equal 30, rows.length
    assert rows.all? { |r| r.key?("date") && r.key?("users_created") && r.key?("jobs_created") && r.key?("applications_created") }
  end
end
