# frozen_string_literal: true

module Compensation
  class Calculator
    Result = Struct.new(
      :base_hourly_rate_cents,
      :overtime_multiplier,
      :weekend_multiplier,
      :applied_multiplier,
      :effective_hourly_rate_cents,
      :worked_hours,
      :gross_pay_cents,
      :rule,
      keyword_init: true
    )

    # Premium policy: unless explicitly configured to stack premiums,
    # pay the highest applicable multiplier to avoid accidental overpayment.
    def self.call(base_hourly_rate_cents:, worked_hours:, overtime_multiplier:, weekend_multiplier:, premium_combination_rule:)
      base_rate = base_hourly_rate_cents.to_i
      overtime = overtime_multiplier.present? ? overtime_multiplier.to_d : nil
      weekend = weekend_multiplier.present? ? weekend_multiplier.to_d : nil
      rule = premium_combination_rule.to_s.presence || "highest_applicable"

      applied_multiplier =
        if rule == "stacked"
          [1.to_d, overtime || 1.to_d, weekend || 1.to_d].reduce(:*)
        else
          [1.to_d, overtime || 1.to_d, weekend || 1.to_d].max
        end

      effective_rate = (base_rate * applied_multiplier).round(0).to_i
      gross_pay = (effective_rate * worked_hours.to_d).round(0).to_i

      Result.new(
        base_hourly_rate_cents: base_rate,
        overtime_multiplier: overtime,
        weekend_multiplier: weekend,
        applied_multiplier: applied_multiplier,
        effective_hourly_rate_cents: effective_rate,
        worked_hours: worked_hours.to_d,
        gross_pay_cents: gross_pay,
        rule: rule
      )
    end
  end
end
