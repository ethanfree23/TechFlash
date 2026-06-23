namespace :verification do
  desc "Expire outdated verification items and badges"
  task expire_items: :environment do
    now = Time.current
    expired_background = BackgroundCheck.where("expires_at IS NOT NULL AND expires_at <= ?", now).where.not(status: :expired)
    expired_background.find_each do |check|
      check.update!(status: :expired)
      VerificationBadge.where(user_id: check.user_id, badge_type: "background_checked", status: :active)
        .where("expires_at IS NULL OR expires_at <= ?", now)
        .update_all(status: VerificationBadge.statuses[:expired], updated_at: now)
      VerificationProfile.for_user!(check.user).update!(background_status: :not_started)
      check.user.technician_profile&.update!(background_verified: false)
    end

    expired_docs = Document.where(status: :approved).where("valid_until IS NOT NULL AND valid_until < ?", Date.current)
    expired_docs.find_each do |doc|
      owner = case doc.uploadable_type
      when "TechnicianProfile"
        TechnicianProfile.find_by(id: doc.uploadable_id)&.user
      else
        nil
      end
      next if owner.blank?

      badge_type = doc.doc_type.to_s == "insurance" ? "insured" : "license_verified"
      VerificationBadge.where(user_id: owner.id, badge_type: badge_type, status: :active)
        .update_all(status: VerificationBadge.statuses[:expired], updated_at: now)

      profile = VerificationProfile.for_user!(owner)
      if doc.doc_type.to_s == "insurance"
        profile.update!(insurance_status: :expired)
      elsif doc.doc_type.to_s.in?(%w[license certificate cert])
        profile.update!(licenses_status: :expired)
      end
    end

    puts "Expired #{expired_background.count} background checks and #{expired_docs.count} documents."
  end
end
