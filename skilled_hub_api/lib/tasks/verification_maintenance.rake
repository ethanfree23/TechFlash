namespace :verification do
  desc "Create Checkr invitations for paid background checks that have none (e.g. after a Checkr outage)"
  task retry_background_check_invitations: :environment do
    summary = Hash.new(0)
    BackgroundCheckFulfillmentService.awaiting_invitation.order(:id).pluck(:id).each do |check_id|
      outcome = BackgroundCheckFulfillmentService.ensure_invitation!(check_id)
      summary[outcome] += 1
    rescue BackgroundCheckFulfillmentService::Error => e
      summary[:failed] += 1
      puts "background_check=#{check_id} failed: #{e.class}"
    end
    puts "Background check invitation retry: #{summary.to_json}"
  end

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

      next unless doc.doc_type.to_s.in?(%w[license certificate cert])

      VerificationBadge.where(user_id: owner.id, badge_type: "license_verified", status: :active)
        .update_all(status: VerificationBadge.statuses[:expired], updated_at: now)

      profile = VerificationProfile.for_user!(owner)
      profile.update!(licenses_status: :expired)
    end

    puts "Expired #{expired_background.count} background checks and #{expired_docs.count} documents."
  end
end
