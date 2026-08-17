# frozen_string_literal: true

# Integer-cents helpers for job financial math. Admin MembershipTierConfig / MembershipPolicy
# supply percentages; this class never hard-codes commission rates.
class JobMoney
  class << self
    def percent_of(cents, percent)
      amount = cents.to_i
      pct = BigDecimal(percent.to_s)
      return 0 if amount.zero? || pct.zero?

      ((BigDecimal(amount) * pct) / BigDecimal("100")).round(0, BigDecimal::ROUND_HALF_UP).to_i
    end

    def company_charge_cents(labor_cents, company_commission_percent)
      labor = labor_cents.to_i
      labor + percent_of(labor, company_commission_percent)
    end

    def technician_payout_cents(labor_cents, technician_commission_percent)
      labor = labor_cents.to_i
      [labor - percent_of(labor, technician_commission_percent), 0].max
    end

    def estimated_hours(hours_per_day, days)
      return nil if hours_per_day.blank? || days.blank?

      BigDecimal(hours_per_day.to_s) * BigDecimal(days.to_s)
    end

    def labor_cents(hourly_rate_cents:, hours_per_day:, days:, fallback_cents: 0)
      if hourly_rate_cents.present? && hours_per_day.present? && days.present?
        (hourly_rate_cents.to_i * hours_per_day.to_i * days.to_i)
      else
        fallback_cents.to_i
      end
    end
  end
end
