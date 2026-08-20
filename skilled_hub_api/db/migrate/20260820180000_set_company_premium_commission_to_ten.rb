# frozen_string_literal: true

# One-time repair of the original seed that set company Premium job commission to 0%.
# Does not encode a forever-10% product rule: only rows still at 0% are touched.
# After this, MembershipTierConfig / Admin remains the source of truth.
class SetCompanyPremiumCommissionToTen < ActiveRecord::Migration[7.1]
  def up
    MembershipTierConfig.where(audience: "company", slug: "premium", commission_percent: 0)
      .update_all(commission_percent: 10)

    CompanyProfile.where(commission_override_percent: 0).update_all(commission_override_percent: nil)
    TechnicianProfile.where(commission_override_percent: 0).update_all(commission_override_percent: nil)

    MembershipPolicy.invalidate_cache! if defined?(MembershipPolicy)
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
          "Refusing to restore company Premium commission to 0%. Set the Admin chart explicitly if needed."
  end
end
