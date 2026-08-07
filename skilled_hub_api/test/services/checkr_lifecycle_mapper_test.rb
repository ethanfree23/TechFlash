require "test_helper"

class CheckrLifecycleMapperTest < ActiveSupport::TestCase
  test "maps report completed clear with includes_canceled to dedicated status" do
    mapping = CheckrLifecycleMapper.resolve(
      event_type: "report.completed",
      object: { "status" => "complete", "result" => "clear", "includes_canceled" => true }
    )
    assert_equal "complete_with_canceled_screenings", mapping[:normalized_status]
    assert_equal true, mapping[:terminal]
  end

  test "maps assess review on report updates to review required" do
    mapping = CheckrLifecycleMapper.resolve(
      event_type: "report.updated",
      object: { "status" => "complete", "result" => "clear", "assessment" => "review" }
    )
    assert_equal "review_required", mapping[:normalized_status]
  end

  test "contains required lifecycle event mappings" do
    rows = CheckrLifecycleMapper.mapping_rows
    required = %w[
      invitation.created
      invitation.completed
      invitation.expired
      invitation.deleted
      report.suspended
      report.resumed
      report.disputed
      report.canceled
      report.pre_adverse_action
      report.post_adverse_action
      report.engaged
      adverse_action.notice_not_delivered
    ]
    required.each do |event_type|
      assert rows.any? { |row| row[:event_type] == event_type }, "missing mapping for #{event_type}"
    end
  end
end
