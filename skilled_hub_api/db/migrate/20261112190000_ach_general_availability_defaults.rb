# frozen_string_literal: true

# ACH GA: new companies default to ach_payments_enabled=true.
# Existing companies are enabled unless AchFeatureAudit shows an explicit admin
# disable (latest company-scope audit with new_value=false).
# Does NOT enable the global PlatformSetting — production global stays OFF.
class AchGeneralAvailabilityDefaults < ActiveRecord::Migration[7.1]
  def up
    say_with_time "enable ACH for companies without explicit admin block audit" do
      # Ruby-side so SQLite CI and PostgreSQL both work (DISTINCT ON is PG-only).
      blocked_ids = []
      if table_exists?(:ach_feature_audits)
        latest_by_company = {}
        AchFeatureAudit.where(scope: "company").where.not(company_profile_id: nil)
                       .order(:company_profile_id, created_at: :desc, id: :desc)
                       .each do |row|
          latest_by_company[row.company_profile_id] ||= row
        end
        blocked_ids = latest_by_company.select { |_id, row| row.new_value == false }.keys
      end

      scope = CompanyProfile.where(ach_payments_enabled: false)
      scope = scope.where.not(id: blocked_ids) if blocked_ids.any?
      scope.update_all(ach_payments_enabled: true)
    end

    change_column_default :company_profiles, :ach_payments_enabled, from: false, to: true
  end

  def down
    change_column_default :company_profiles, :ach_payments_enabled, from: true, to: false
  end
end
