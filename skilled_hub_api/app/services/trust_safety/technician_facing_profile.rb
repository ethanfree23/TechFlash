# frozen_string_literal: true

module TrustSafety
  # Technician-safe projection of TrustProfile for Settings → Verification.
  # Keeps the same checklist shape admins see, but strips admin-only fields
  # (Checkr dashboard links, override actions, internal notes) and rewrites
  # next-action copy for the technician.
  class TechnicianFacingProfile
    def self.call(user)
      profile = TrustProfile.call(user)
      return nil unless profile

      new(profile, user).call
    end

    def initialize(profile, user)
      @profile = profile
      @user = user
      @tech_profile = user.technician_profile
    end

    def call
      checklist = Array(@profile[:checklist]).map { |row| sanitize_row(row) }
      enrich_contact_row!(checklist)

      {
        technician: sanitize_technician(@profile[:technician]),
        checklist: checklist,
        summary: build_summary(checklist),
        items: {
          background_checks: Array(@profile.dig(:items, :background_checks)).map { |c| sanitize_background_check(c) },
          credentials: Array(@profile.dig(:items, :credentials)).map { |d| sanitize_credential(d) },
          references: Array(@profile.dig(:items, :references)).map { |r| sanitize_reference(r) }
        },
        badges: Array(@profile[:badges]).map do |b|
          {
            badge_type: b[:badge_type] || b["badge_type"],
            status: b[:status] || b["status"],
            earned_at: b[:earned_at] || b["earned_at"],
            expires_at: b[:expires_at] || b["expires_at"]
          }
        end
      }
    end

    private

    def build_summary(checklist)
      required = checklist.reject { |row| row[:optional] }
      satisfied = required.count { |row| %w[verified not_applicable].include?(row[:status].to_s) }
      {
        verified_count: satisfied,
        total: required.size,
        needs_review_count: checklist.count { |row| row[:status].to_s == "needs_review" },
        complete: required.any? && required.all? { |row| %w[verified not_applicable].include?(row[:status].to_s) },
        background_verified: @tech_profile&.background_verified == true,
        inventory_missing: Array(@profile.dig(:summary, :inventory_missing))
      }
    end

    def sanitize_technician(identity)
      return nil unless identity

      identity.slice(
        :user_id, :technician_profile_id, :first_name, :last_name, :full_name,
        :display_name, :has_real_name, :initials, :email, :phone, :avatar_url,
        :avatar_updated_at, :trade, :location_label, :background_verified
      )
    end

    def sanitize_row(row)
      key = row[:key].to_s
      status = row[:status].to_s
      out = {
        key: key,
        label: technician_label(key, row[:label]),
        status: status,
        status_label: row[:status_label],
        tone: row[:tone],
        detail: technician_detail(key, row[:detail], status),
        updated_at: row[:updated_at],
        next_action: technician_next_action(key, status, row[:next_action]),
        optional: row[:optional] == true
      }
      out[:counts] = row[:counts] if row[:counts].is_a?(Hash)
      out
    end

    def enrich_contact_row!(checklist)
      contact = checklist.find { |row| row[:key].to_s == "contact" }
      return unless contact

      photo_ok = @tech_profile&.avatar&.attached?
      email_ok = @user.email.present?
      phone_ok = (@user.phone.presence || @tech_profile&.phone.presence).present?

      pieces = []
      pieces << (photo_ok ? "Photo on file" : "Photo missing")
      pieces << (email_ok ? "Email on file" : "Email missing")
      pieces << (phone_ok ? "Phone on file" : "Phone missing")

      all_ok = photo_ok && email_ok && phone_ok
      any_ok = photo_ok || email_ok || phone_ok
      status = if all_ok
                 "verified"
               elsif any_ok
                 "pending"
               else
                 "not_started"
               end

      contact[:label] = "Profile & contact"
      contact[:status] = status
      contact[:status_label] = if all_ok
                                 "Photo, email & phone on file"
                               elsif any_ok
                                 "Incomplete"
                               else
                                 "Not started"
                               end
      contact[:tone] = tone_for(status)
      contact[:detail] = "#{pieces.join(' · ')}."
      contact[:next_action] = all_ok ? nil : "Update your photo, email, or phone on the Profile tab."
      contact[:has_photo] = photo_ok
      contact[:has_email] = email_ok
      contact[:has_phone] = phone_ok
    end

    def technician_label(key, fallback)
      return "Profile & contact" if key == "contact"

      fallback
    end

    def technician_detail(key, detail, status)
      case key
      when "background_check"
        return "No background check has been started yet." if status == "not_started"
        return "Your background check cleared — no action needed." if status == "verified"
        return "TechFlash is reviewing your background check result." if status == "needs_review"
        return "Your background check is in progress." if status == "pending"
        detail
      when "references"
        detail.to_s.gsub("Admin-added references stay unverified until you explicitly mark them verified after contact.", "").presence || detail
      when "trade_license"
        detail.to_s.gsub("Reviewer approval does not confirm the credential with the issuing authority.",
                         "Approval confirms a document review, not verification with the issuing authority.")
      else
        detail
      end
    end

    def technician_next_action(key, status, admin_next)
      case key
      when "background_check"
        return "Start your background check below." if status == "not_started"
        return "Continue your Checkr invitation." if status == "pending"
        return "TechFlash is reviewing your result." if status == "needs_review"
        return nil if status == "verified"

        admin_next
      when "references"
        return "Add professional references below." if status == "not_started"
        return "Waiting for your references to respond." if status == "pending"
        return "TechFlash is reviewing your references." if status == "needs_review"
        nil
      when "trade_license"
        return "Upload a license or certification below." if %w[not_started incomplete].include?(status)
        return "Waiting for TechFlash to review your upload." if status == "needs_review"
        return "Upload a corrected document." if status == "rejected"
        return "Upload a renewed credential." if status == "expired"
        nil
      when "contact"
        return "Update your photo, email, or phone on the Profile tab." unless status == "verified"

        nil
      else
        admin_next
      end
    end

    def sanitize_status(status)
      return status unless status.is_a?(Hash)

      status = status.respond_to?(:symbolize_keys) ? status.symbolize_keys : status
      {
        key: status[:key] || status["key"],
        label: status[:label] || status["label"],
        tone: status[:tone] || status["tone"]
      }
    end

    def sanitize_background_check(check)
      status = check[:status] || check["status"]
      lifecycle = check[:lifecycle_summary] || check["lifecycle_summary"] || {}
      eligibility = check[:eligibility] || check["eligibility"] || {}
      eligibility = eligibility.respond_to?(:symbolize_keys) ? eligibility.symbolize_keys : eligibility
      {
        key: check[:key] || check["key"],
        id: check[:id] || check["id"],
        title: check[:title] || check["title"],
        status: sanitize_status(status),
        updated_at: check[:updated_at] || check["updated_at"],
        lifecycle_summary: {
          started_at: lifecycle[:started_at] || lifecycle["started_at"],
          completed_at: lifecycle[:completed_at] || lifecycle["completed_at"]
        },
        # invitation_url comes from the dedicated background_check payload on /verification
        eligibility: {
          eligible_for_verified_badge: eligibility[:eligible_for_verified_badge],
          profile_flag_background_verified: eligibility[:profile_flag_background_verified]
        }
      }
    end

    def sanitize_credential(doc)
      status = doc[:status] || doc["status"]
      reviewer = doc.dig(:reviewer_decision, :reviewer) || doc.dig("reviewer_decision", "reviewer")
      {
        key: doc[:key] || doc["key"],
        id: doc[:id] || doc["id"],
        title: doc[:title] || doc["title"],
        subtitle: doc[:subtitle] || doc["subtitle"],
        doc_type: doc[:doc_type] || doc["doc_type"],
        status: sanitize_status(status),
        issuer: doc[:issuer] || doc["issuer"],
        document_number: doc[:document_number] || doc["document_number"],
        updated_at: doc[:updated_at] || doc["updated_at"],
        expires_at: doc[:expires_at] || doc["expires_at"],
        has_file: doc[:has_file] || doc["has_file"],
        reviewer_name: reviewer.is_a?(Hash) ? (reviewer[:name] || reviewer["name"]) : nil
      }
    end

    def sanitize_reference(ref)
      status = ref[:status] || ref["status"]
      reviewer = ref.dig(:reviewer_decision, :reviewer) || ref.dig("reviewer_decision", "reviewer")
      {
        key: ref[:key] || ref["key"],
        id: ref[:id] || ref["id"],
        title: ref[:title] || ref["title"] || ref[:full_name] || ref["full_name"],
        subtitle: ref[:subtitle] || ref["subtitle"],
        full_name: ref[:full_name] || ref["full_name"],
        relationship: ref[:relationship] || ref["relationship"],
        company_name: ref[:company_name] || ref["company_name"],
        email: ref[:email] || ref["email"],
        phone: ref[:phone] || ref["phone"],
        status: sanitize_status(status),
        updated_at: ref[:updated_at] || ref["updated_at"],
        submitted_at: ref[:submitted_at] || ref["submitted_at"],
        reviewer_name: reviewer.is_a?(Hash) ? (reviewer[:name] || reviewer["name"]) : nil
      }
    end

    def tone_for(status)
      case status.to_s
      when "verified" then "success"
      when "needs_review" then "orange"
      when "pending" then "info"
      when "rejected" then "danger"
      when "expired", "incomplete" then "warning"
      else "neutral"
      end
    end
  end
end
