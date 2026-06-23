module Api
  module V1
    module Admin
      class TrustSafetyController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        def dashboard
          pending_background = BackgroundCheck.where(status: %i[pending processing consider invited]).count
          pending_references = VerificationReference.pending_review.count
          pending_documents = Document.pending_review_queue.where(doc_type: %w[license certificate cert insurance]).count
          expiring_soon = BackgroundCheck.where("expires_at IS NOT NULL AND expires_at <= ?", 30.days.from_now).count
          expiring_docs = Document.where("valid_until IS NOT NULL AND valid_until <= ?", 30.days.from_now.to_date).count
          failed_or_flagged = BackgroundCheck.where(status: %i[failed consider suspended manually_rejected]).count
          verified_technicians = TechnicianProfile.where(background_verified: true).count
          completion_rate = verification_completion_rate

          render json: {
            cards: {
              pending_background_reviews: pending_background,
              pending_references: pending_references,
              pending_licenses_certs: pending_documents,
              expiring_soon: expiring_soon + expiring_docs,
              failed_flagged_checks: failed_or_flagged,
              verified_technicians: verified_technicians,
              verification_completion_rate: completion_rate
            },
            pending_background_checks: BackgroundCheck.where(status: %i[pending processing consider invited]).order(created_at: :desc).limit(100),
            expiring_background_checks: BackgroundCheck.where("expires_at IS NOT NULL AND expires_at <= ?", 30.days.from_now).order(:expires_at).limit(100),
            pending_references: VerificationReference.pending_review.limit(100),
            pending_documents: Document.pending_review_queue.where(doc_type: %w[license certificate cert insurance]).limit(100),
            audit_timeline: VerificationAuditLog.order(created_at: :desc).limit(200)
          }, status: :ok
        end

        def override_background_check
          check = BackgroundCheck.find(params[:id])
          override = params[:override_status].to_s
          notes = params[:admin_notes].to_s
          unless %w[manually_approved manually_rejected].include?(override)
            return render json: { error: "override_status must be manually_approved or manually_rejected" }, status: :unprocessable_entity
          end

          check.update!(
            status: override,
            admin_override_status: override,
            admin_notes: notes,
            completed_at: Time.current
          )
          if override == "manually_approved"
            check.update!(expires_at: 1.year.from_now) if check.expires_at.blank?
            VerificationBadge.set_active!(user: check.user, badge_type: "background_checked", source: check, expires_at: check.expires_at)
            check.user.technician_profile&.update!(background_verified: true)
            VerificationProfile.for_user!(check.user).update!(background_status: :verified, last_verified_at: Time.current)
          else
            check.user.technician_profile&.update!(background_verified: false)
            VerificationProfile.for_user!(check.user).update!(background_status: :rejected)
          end
          VerificationAuditLog.record!(
            user: check.user,
            actor_user: @current_user,
            entity: check,
            action: "background_check_override",
            details: { override_status: override, admin_notes: notes }
          )
          VerificationEventNotifier.background_check_result(check.user, check)

          render json: { message: "Background check override saved.", background_check: check }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Background check not found" }, status: :not_found
        end

        def review_reference
          ref = VerificationReference.find(params[:id])
          review_status = params[:status].to_s
          unless %w[approved rejected].include?(review_status)
            return render json: { error: "status must be approved or rejected" }, status: :unprocessable_entity
          end

          ref.update!(
            status: review_status,
            reviewed_by_user: @current_user,
            reviewed_at: Time.current,
            review_notes: params[:review_notes].to_s.presence
          )
          sync_reference_verification!(ref.technician_user)
          VerificationAuditLog.record!(
            user: ref.technician_user,
            actor_user: @current_user,
            entity: ref,
            action: "reference_#{review_status}",
            details: { review_notes: ref.review_notes }
          )
          VerificationEventNotifier.reference_reviewed(ref.technician_user, ref)
          render json: { message: "Reference #{review_status}.", reference: ref }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Reference not found" }, status: :not_found
        end

        def review_document
          doc = Document.find(params[:id])
          review_status = params[:status].to_s
          unless %w[approved rejected].include?(review_status)
            return render json: { error: "status must be approved or rejected" }, status: :unprocessable_entity
          end

          doc.update!(
            status: review_status,
            reviewed_by_user: @current_user,
            reviewed_at: Time.current,
            rejection_reason: (review_status == "rejected" ? params[:rejection_reason].to_s.presence : nil)
          )
          owner_user = resolve_document_owner_user(doc)
          if owner_user.present?
            sync_document_verification!(owner_user, doc)
            VerificationAuditLog.record!(
              user: owner_user,
              actor_user: @current_user,
              entity: doc,
              action: "document_#{review_status}",
              details: { doc_type: doc.doc_type, rejection_reason: doc.rejection_reason }
            )
            VerificationEventNotifier.document_reviewed(owner_user, doc)
          end
          render json: { message: "Document #{review_status}.", document: doc }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Document not found" }, status: :not_found
        end

        private

        def verification_completion_rate
          total = TechnicianProfile.count
          return 0.0 if total.zero?
          completed = VerificationProfile.where(background_status: :verified).or(VerificationProfile.where(identity_status: :verified)).count
          ((completed.to_f / total) * 100).round(1)
        end

        def sync_reference_verification!(technician_user)
          profile = VerificationProfile.for_user!(technician_user)
          approved_count = VerificationReference.where(technician_user_id: technician_user.id, status: :approved).count
          if approved_count >= 2
            profile.update!(references_status: :verified, last_verified_at: Time.current)
            VerificationBadge.set_active!(user: technician_user, badge_type: "references_verified")
            VerificationBadge.set_active!(user: technician_user, badge_type: "references_verified_#{approved_count}")
          elsif VerificationReference.where(technician_user_id: technician_user.id, status: :responded).exists?
            profile.update!(references_status: :pending)
          else
            profile.update!(references_status: :not_started)
          end
        end

        def sync_document_verification!(owner_user, doc)
          profile = VerificationProfile.for_user!(owner_user)
          return unless owner_user.technician?

          if doc.doc_type.to_s.in?(%w[license certificate cert])
            if doc.approved?
              profile.update!(licenses_status: :verified, last_verified_at: Time.current)
              badge_name = doc.doc_type.to_s == "certificate" ? "cert_#{doc.issuer.to_s.downcase.gsub(/\s+/, "_")}" : "license_verified"
              VerificationBadge.set_active!(user: owner_user, badge_type: badge_name.presence || "license_verified", source: doc, expires_at: doc.valid_until)
            elsif doc.rejected?
              profile.update!(licenses_status: :pending) if profile.licenses_status.to_s != "verified"
            end
          end

          if doc.doc_type.to_s == "insurance"
            if doc.approved?
              profile.update!(insurance_status: :verified, last_verified_at: Time.current)
              VerificationBadge.set_active!(user: owner_user, badge_type: "insured", source: doc, expires_at: doc.valid_until)
            elsif doc.rejected?
              profile.update!(insurance_status: :pending)
            end
          end
        end

        def resolve_document_owner_user(doc)
          case doc.uploadable_type
          when "TechnicianProfile"
            TechnicianProfile.find_by(id: doc.uploadable_id)&.user
          when "CompanyProfile"
            CompanyProfile.find_by(id: doc.uploadable_id)&.user
          when "JobApplication"
            JobApplication.find_by(id: doc.uploadable_id)&.technician_profile&.user
          else
            nil
          end
        end
      end
    end
  end
end
