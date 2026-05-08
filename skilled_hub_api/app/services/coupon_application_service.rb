class CouponApplicationService
  def self.resolve_active_assignment(user:)
    return nil if user.blank?

    CouponAssignment.includes(:coupon).where(user_id: user.id).active_now.detect { |a| a.coupon&.active_now? }
  end

  def self.apply_fee_discount(base_fee_cents:, user:)
    assignment = resolve_active_assignment(user: user)
    return base_fee_cents unless assignment

    coupon = assignment.coupon
    case coupon.discount_kind
    when "percent"
      discount = (base_fee_cents.to_i * coupon.discount_value.to_i / 100.0).round
      [base_fee_cents.to_i - discount, 0].max
    when "fixed_cents"
      [base_fee_cents.to_i - coupon.discount_value.to_i, 0].max
    else
      base_fee_cents
    end
  end

  def self.apply_commission_discount(base_commission_percent:, user:)
    assignment = resolve_active_assignment(user: user)
    return base_commission_percent.to_f unless assignment

    coupon = assignment.coupon
    if coupon.discount_kind == "percent"
      [(base_commission_percent.to_f * (100.0 - coupon.discount_value.to_f) / 100.0), 0.0].max
    elsif coupon.discount_kind == "fixed_cents"
      base_commission_percent.to_f
    else
      base_commission_percent.to_f
    end
  end
end
