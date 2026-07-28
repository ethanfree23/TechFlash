require "test_helper"

module Compensation
  class CalculatorTest < ActiveSupport::TestCase
    test "uses highest applicable multiplier by default" do
      result = Calculator.call(
        base_hourly_rate_cents: 4_000,
        worked_hours: 1,
        overtime_multiplier: 1.5,
        weekend_multiplier: 2.0,
        premium_combination_rule: "highest_applicable"
      )

      assert_equal 8_000, result.effective_hourly_rate_cents
      assert_equal 8_000, result.gross_pay_cents
      assert_equal BigDecimal("2.0"), result.applied_multiplier
    end

    test "stacks premiums when rule is stacked" do
      result = Calculator.call(
        base_hourly_rate_cents: 4_000,
        worked_hours: 1,
        overtime_multiplier: 1.5,
        weekend_multiplier: 1.5,
        premium_combination_rule: "stacked"
      )

      assert_equal 9_000, result.effective_hourly_rate_cents
      assert_equal 9_000, result.gross_pay_cents
    end
  end
end
