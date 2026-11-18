module Api
  module V1
    module Admin
      class TrustSafetyController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        ITEM_TYPES = {
          "background_check" => BackgroundCheck,
          "document" => Document,
          "reference" => VerificationReference
        }.freeze

        # ------------------------------------------------------------------------------
        # Read endpoints for the redesigned Trust & Safety workspace
        # ------------------------------------------------------------------------------

        def summary
          render json: TrustSafety::Summary.call, status: :ok
        end

        def queue
          render json: TrustSafety::ReviewQueue.call(queue_params), status: :ok
        end

        def technicians
          render json: TrustSafety::TechnicianDirectory.call(technicians_params), status: :ok
        end

        def technician
          user = User.find(params[:user_id])
          profile = TrustSafety::TrustProfile.call(user)
          return render json: { error: "User is not a technician" }, status: :unprocessable_entity if profile.nil?

          render json: { trust_profile: profile }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Technician not found" }, status: :not_found
        end

        def item
          record = find_item!(params[:item_type], params[:id])
          payload = serialize_item(record, detail: true)
          if record.is_a?(Document)
            file = (payload[:file] || payload["file"] || TrustSafety::DocumentFileAccess.for(record))
            audit_document_access!(record, file.to_h.symbolize_keys, source: "item_detail")
          end
          render json: { item: payload, audit: item_audit(record) }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Item not found" }, status: :not_found
        end

        # Short-lived signed URL for a technician document. Admin-only; the signed blob id
        # expires after TrustSafety::DocumentFileAccess::TTL so links cannot be shared.
        def document_file
          doc = Document.find(params[:id])
          unless reviewable_document?(doc)
            return render json: { error: "Document is not part of technician verification" }, status: :forbidden
          end

          file = TrustSafety::DocumentFileAccess.for(doc)
          audit_document_access!(doc, file, source: "document_file")
          render json: { file: file }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Document not found" }, status: :not_found
        end

        def audit
          render json: TrustSafety::AuditFeed.call(audit_params), status: :ok
        end

        # ------------------------------------------------------------------------------
        # Reviewer notes / information requests / contact attempts
        # ------------------------------------------------------------------------------

        def create_note
          record = find_item!(params[:item_type], params[:id])
          body = params[:note].to_s.strip
          return render json: { error: "note is required" }, status: :unprocessable_entity if body.blank?

          owner = owner_user_for(record)
          return render json: { error: "Item has no technician owner" }, status: :unprocessable_entity unless owner

          log = VerificationAuditLog.record!(user: owner, actor_user: @current_user, entity: record, action: "reviewer_note", details: { note: body })
          render json: { message: "Note saved.", event: TrustSafety::AuditFeed.serialize(log), item: serialize_item(record, detail: true) }, status: :created
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Item not found" }, status: :not_found
        end

        def request_document_info
          doc = Document.find(params[:id])
          return render json: { error: "Document is not part of technician verification" }, status: :forbidden unless reviewable_document?(doc)

          message = params[:reason].to_s.strip
          return render json: { error: "reason is required" }, status: :unprocessable_entity if message.blank?
          return render json: { error: "Only pending documents can have information requested", code: "already_reviewed" }, status: :conflict unless doc.pending_review?

          owner = resolve_document_owner_user(doc)
          return render json: { error: "Document has no technician owner" }, status: :unprocessable_entity unless owner

          doc.touch
          VerificationAuditLog.record!(user: owner, actor_user: @current_user, entity: doc, action: "document_info_requested", details: { doc_type: doc.doc_type, message: message })
          VerificationEventNotifier.more_information_requested(owner, doc, message: message)
          render json: { message: "Information request sent to the technician.", item: serialize_item(doc, detail: true) }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Document not found" }, status: :not_found
        end

        def request_reference_info
          ref = VerificationReference.find(params[:id])
          message = params[:reason].to_s.strip
          return render json: { error: "reason is required" }, status: :unprocessable_entity if message.blank?
          return render json: { error: "Reference has already been decided", code: "already_reviewed" }, status: :conflict unless ref.requested? || ref.responded?

          ref.touch
          VerificationAuditLog.record!(user: ref.technician_user, actor_user: @current_user, entity: ref, action: "reference_info_requested", details: { reference_name: ref.full_name, message: message })
          VerificationEventNotifier.more_information_requested(ref.technician_user, ref, message: message)
          render json: { message: "Information request sent to the technician.", item: serialize_item(ref, detail: true) }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Reference not found" }, status: :not_found
        end

        def record_reference_contact_attempt
          ref = VerificationReference.find(params[:id])
          outcome = params[:outcome].to_s
          unless TrustSafety::ReferencePolicy::CONTACT_OUTCOMES.include?(outcome)
            return render json: { error: "outcome must be one of #{TrustSafety::ReferencePolicy::CONTACT_OUTCOMES.join(', ')}" }, status: :unprocessable_entity
          end

          method = params[:method].to_s.presence
          note = params[:note].to_s.strip.presence
          actor_name = [@current_user.first_name, @current_user.last_name].map(&:presence).compact.join(" ").presence || @current_user.email
          answers = ref.answers.is_a?(Hash) ? ref.answers.deep_dup.stringify_keys : {}
          attempt = {
            "outcome" => outcome,
            "method" => method,
            "note" => note,
            "contacted_at" => Time.current.iso8601,
            "contacted_by_user_id" => @current_user.id,
            "contacted_by_name" => actor_name
          }
          attempts = Array(answers["contact_attempts"]).map { |row| row.is_a?(Hash) ? row.stringify_keys : row }
          attempts << attempt
          answers["contact_attempts"] = attempts.last(25)
          answers["admin_contact"] = {
            "last_outcome" => outcome,
            "last_method" => method,
            "last_note" => note,
            "last_contacted_at" => attempt["contacted_at"],
            "last_contacted_by_user_id" => @current_user.id,
            "last_contacted_by_name" => actor_name
          }
          ref.update!(answers: answers)
          VerificationAuditLog.record!(
            user: ref.technician_user, actor_user: @current_user, entity: ref, action: "reference_contact_attempt",
            details: { outcome: outcome, method: method, note: note, reference_name: ref.full_name }
          )
          render json: { message: "Contact attempt recorded.", item: serialize_item(ref.reload, detail: true) }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Reference not found" }, status: :not_found
        end

        # ------------------------------------------------------------------------------
        # Admin create / update / destroy from the technician Verification workspace
        # ------------------------------------------------------------------------------

        def create_reference
          tech = find_technician_user!(params[:user_id])
          result = TrustSafety::AdminVerificationRecords.create_reference(
            technician_user: tech,
            attrs: reference_write_params,
            actor: @current_user
          )
          return render json: { error: result.errors.to_sentence, errors: result.errors }, status: :unprocessable_entity unless result.ok

          render json: {
            message: "Reference added. It is not verified until you explicitly mark it verified.",
            item: serialize_item(result.record, detail: true),
            trust_profile: result.trust_profile
          }, status: :created
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Technician not found" }, status: :not_found
        end

        def update_reference
          ref = VerificationReference.find(params[:id])
          result = TrustSafety::AdminVerificationRecords.update_reference(
            reference: ref,
            attrs: reference_write_params,
            actor: @current_user
          )
          return render json: { error: result.errors.to_sentence, errors: result.errors }, status: :unprocessable_entity unless result.ok

          render json: {
            message: "Reference updated.",
            item: serialize_item(result.record, detail: true),
            trust_profile: result.trust_profile
          }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Reference not found" }, status: :not_found
        end

        def destroy_reference
          ref = VerificationReference.find(params[:id])
          confirm = ActiveModel::Type::Boolean.new.cast(params[:confirm])
          result = TrustSafety::AdminVerificationRecords.destroy_reference(
            reference: ref,
            actor: @current_user,
            confirm: confirm
          )
          return render json: { error: result.errors.to_sentence, errors: result.errors }, status: :unprocessable_entity unless result.ok

          render json: { message: "Reference removed.", trust_profile: result.trust_profile }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Reference not found" }, status: :not_found
        end

        def create_credential
          tech = find_technician_user!(params[:user_id])
          result = TrustSafety::AdminVerificationRecords.create_credential(
            technician_user: tech,
            attrs: credential_write_params,
            file: params[:file],
            actor: @current_user
          )
          return render json: { error: result.errors.to_sentence, errors: result.errors }, status: :unprocessable_entity unless result.ok

          render json: {
            message: "Credential added. It remains pending until you approve it.",
            item: serialize_item(result.record, detail: true),
            trust_profile: result.trust_profile
          }, status: :created
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Technician not found" }, status: :not_found
        end

        def update_credential
          doc = Document.find(params[:id])
          unless reviewable_document?(doc) && TrustSafety::DocumentPolicy.category(doc) == "credential"
            return render json: { error: "Document is not a technician trade credential" }, status: :forbidden
          end

          result = TrustSafety::AdminVerificationRecords.update_credential(
            document: doc,
            attrs: credential_write_params,
            file: params[:file],
            actor: @current_user
          )
          return render json: { error: result.errors.to_sentence, errors: result.errors }, status: :unprocessable_entity unless result.ok

          render json: {
            message: "Credential updated.",
            item: serialize_item(result.record.reload, detail: true),
            trust_profile: result.trust_profile
          }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Document not found" }, status: :not_found
        end

        # ------------------------------------------------------------------------------
        # Legacy dashboard (kept for backwards compatibility)
        # ------------------------------------------------------------------------------

        def dashboard
          pending_background = BackgroundCheck.where(status: %i[pending processing consider invited]).count
          pending_references = VerificationReference.pending_review.count
          pending_documents = Document.pending_review_queue.where(doc_type: %w[license certificate cert identity drivers_license passport]).count
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
            pending_background_checks: serialize_checks(
              BackgroundCheck.where(status: %i[pending processing consider invited suspended failed])
                .includes(user: :technician_profile)
                .order(created_at: :desc)
                .limit(100)
            ),
            expiring_background_checks: serialize_checks(
              BackgroundCheck.where("expires_at IS NOT NULL AND expires_at <= ?", 30.days.from_now)
                .includes(user: :technician_profile)
                .order(:expires_at)
                .limit(100)
            ),
            checkr_webhook_anomalies: serialize_webhook_anomalies(CheckrWebhookEvent.where.not(processing_error: [nil, ""]).order(updated_at: :desc).limit(100)),
            pending_references: serialize_references(VerificationReference.pending_review.limit(100)),
            pending_documents: serialize_documents(
              Document.pending_review_queue.where(doc_type: %w[license certificate cert identity drivers_license passport]).limit(100)
            ),
            audit_timeline: serialize_audit_events(VerificationAuditLog.order(created_at: :desc).limit(200))
          }, status: :ok
        end

        # Manual override of the *internal* decision on a Checkr report. The Checkr report
        # itself is never modified. Requires: a reviewable report (policy), a written
        # reason, explicit confirmation, and an unchanged record (optimistic concurrency).
        def override_background_check
          check = BackgroundCheck.find(params[:id])
          override = params[:override_status].to_s
          notes = (params[:reason].presence || params[:admin_notes]).to_s.strip
          unless %w[manually_approved manually_rejected].include?(override)
            return render json: { error: "override_status must be manually_approved or manually_rejected" }, status: :unprocessable_entity
          end
          return render json: { error: "A written reason is required for a manual override.", code: "reason_required" }, status: :unprocessable_entity if notes.blank?
          return render json: { error: "Confirmation is required for a manual override.", code: "confirmation_required" }, status: :unprocessable_entity unless confirmed?
          unless TrustSafety::BackgroundCheckPolicy.override_allowed?(check, override)
            return render json: {
              error: TrustSafety::BackgroundCheckPolicy.override_block_reason(check) || "This override is not allowed for the report's current state.",
              code: "override_not_allowed",
              provider_status: TrustSafety::BackgroundCheckPolicy.presentation(check),
              allowed_overrides: TrustSafety::BackgroundCheckPolicy.allowed_overrides(check)
            }, status: :unprocessable_entity
          end
          if (conflict = stale_write_conflict(check, required: true))
            return render json: conflict, status: conflict[:code] == "stale_write" ? :conflict : :unprocessable_entity
          end

          previous_override = check.admin_override_status
          previous_status = check.status
          # Preserve the provider phase: the legacy status enum doubles as the eligibility
          # flag, so writing it must not erase what Checkr actually reported. Only the
          # listed attributes are written — Checkr result / report ids are never touched.
          check.normalized_status = check.normalized_status_value if check.normalized_status.blank?
          # The provider's completion timestamp is part of the Checkr record; only fill it when
          # there is none. The override's own timestamp lives in the audit log.
          check.update!(
            status: override,
            admin_override_status: override,
            admin_notes: notes,
            completed_at: check.completed_at || Time.current
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
            details: {
              override_status: override,
              admin_notes: notes,
              reason: notes,
              previous_override_status: previous_override,
              previous_status: previous_status,
              provider_normalized_status: check.normalized_status_value,
              provider_result: check.result,
              provider_report_id: check.provider_report_id
            }
          )
          VerificationEventNotifier.background_check_result(check.user, check)

          render json: {
            message: "Background check override saved.",
            background_check: check,
            item: serialize_item(check.reload, detail: true)
          }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Background check not found" }, status: :not_found
        end

        def review_reference
          ref = VerificationReference.find(params[:id])
          review_status = params[:status].to_s
          notes = (params[:reason].presence || params[:review_notes]).to_s.strip
          unless %w[approved rejected].include?(review_status)
            return render json: { error: "status must be approved or rejected" }, status: :unprocessable_entity
          end

          already_decided = ref.approved? || ref.rejected?
          override = override_requested?
          if already_decided && !override
            return render json: {
              error: "This reference was already #{ref.status}. Re-open with an override and a reason to change the decision.",
              code: "already_reviewed",
              item: serialize_item(ref, detail: true)
            }, status: :conflict
          end
          return render json: { error: "A reason is required to reject a reference.", code: "reason_required" }, status: :unprocessable_entity if review_status == "rejected" && notes.blank?
          if review_status == "approved" && ref.requested? && !override
            return render json: {
              error: "This reference has not responded yet. Approving requires an override and a note describing how it was verified.",
              code: "override_required"
            }, status: :unprocessable_entity
          end
          return render json: { error: "A reason is required for an override.", code: "reason_required" }, status: :unprocessable_entity if override && notes.blank?
          if (conflict = stale_write_conflict(ref, required: true))
            return render json: conflict, status: conflict[:code] == "stale_write" ? :conflict : :unprocessable_entity
          end

          previous_status = ref.status
          ref.update!(
            status: review_status,
            reviewed_by_user: @current_user,
            reviewed_at: Time.current,
            review_notes: notes.presence
          )
          sync_reference_verification!(ref.technician_user)
          VerificationAuditLog.record!(
            user: ref.technician_user,
            actor_user: @current_user,
            entity: ref,
            action: already_decided ? "reference_rereviewed" : "reference_#{review_status}",
            details: { review_notes: ref.review_notes, reason: notes.presence, new_status: review_status, previous_status: previous_status, override: override }
          )
          VerificationEventNotifier.reference_reviewed(ref.technician_user, ref)
          render json: { message: "Reference #{review_status}.", reference: ref, item: serialize_item(ref.reload, detail: true) }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Reference not found" }, status: :not_found
        end

        def review_document
          doc = Document.find(params[:id])
          unless reviewable_document?(doc)
            return render json: { error: "Document is not part of technician verification" }, status: :forbidden
          end
          review_status = params[:status].to_s
          reason = (params[:reason].presence || params[:rejection_reason]).to_s.strip
          unless %w[approved rejected].include?(review_status)
            return render json: { error: "status must be approved or rejected" }, status: :unprocessable_entity
          end

          already_decided = doc.approved? || doc.rejected?
          override = override_requested?
          if already_decided && !override
            return render json: {
              error: "This document was already #{doc.status}. Re-open with an override and a reason to change the decision.",
              code: "already_reviewed",
              item: serialize_item(doc, detail: true)
            }, status: :conflict
          end
          return render json: { error: "A reason is required to reject a document.", code: "reason_required" }, status: :unprocessable_entity if review_status == "rejected" && reason.blank?
          return render json: { error: "A reason is required for an override.", code: "reason_required" }, status: :unprocessable_entity if override && reason.blank?
          if (conflict = stale_write_conflict(doc, required: true))
            return render json: conflict, status: conflict[:code] == "stale_write" ? :conflict : :unprocessable_entity
          end

          previous_status = doc.status
          doc.update!(
            status: review_status,
            reviewed_by_user: @current_user,
            reviewed_at: Time.current,
            rejection_reason: (review_status == "rejected" ? reason.presence : nil)
          )
          owner_user = resolve_document_owner_user(doc)
          if owner_user.present?
            sync_document_verification!(owner_user, doc)
            VerificationAuditLog.record!(
              user: owner_user,
              actor_user: @current_user,
              entity: doc,
              action: already_decided ? "document_rereviewed" : "document_#{review_status}",
              details: { doc_type: doc.doc_type, rejection_reason: doc.rejection_reason, reason: reason.presence, new_status: review_status, previous_status: previous_status, override: override }
            )
            VerificationEventNotifier.document_reviewed(owner_user, doc)
          end
          render json: { message: "Document #{review_status}.", document: serialize_documents([doc]).first, item: serialize_item(doc.reload, detail: true) }, status: :ok
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Document not found" }, status: :not_found
        end

        private

        def queue_params
          params.permit(:q, :review_type, :status, :trade, :state, :technician_user_id, :sort, :page, :per_page).to_h.symbolize_keys
        end

        def technicians_params
          params.permit(:q, :verification, :trade, :state, :sort, :page, :per_page).to_h.symbolize_keys
        end

        def audit_params
          params.permit(:technician_user_id, :item_type, :item_id, :event_action, :q, :page, :per_page).to_h.symbolize_keys
        end

        def confirmed?
          ActiveModel::Type::Boolean.new.cast(params[:confirm]) == true
        end

        def override_requested?
          ActiveModel::Type::Boolean.new.cast(params[:override]) == true
        end

        # Optimistic concurrency: clients must send the `updated_at` they rendered; if another
        # reviewer changed the record since, refuse the write and return the latest state.
        # Decision-changing endpoints pass required: true so last-write-wins cannot bypass the UI.
        def stale_write_conflict(record, required: false)
          expected = params[:expected_updated_at].to_s
          if expected.blank?
            return nil unless required

            return {
              error: "expected_updated_at is required so concurrent reviews cannot overwrite each other.",
              code: "expected_updated_at_required"
            }
          end

          begin
            expected_time = Time.iso8601(expected)
          rescue ArgumentError
            return { error: "expected_updated_at must be an ISO8601 timestamp", code: "invalid_expected_updated_at" }
          end
          return nil if (record.updated_at.to_f - expected_time.to_f).abs < 1

          {
            error: "This item was updated by another reviewer. Review the latest decision before acting.",
            code: "stale_write",
            item: serialize_item(record, detail: true)
          }
        end

        # Lightweight access audit: who viewed which technician document, without storing URLs
        # or file contents. One event per file mint / detail open is enough for accountability.
        def audit_document_access!(doc, file, source:)
          owner = resolve_document_owner_user(doc)
          return unless owner

          VerificationAuditLog.record!(
            user: owner,
            actor_user: @current_user,
            entity: doc,
            action: "document_accessed",
            details: {
              source: source,
              doc_type: doc.doc_type,
              available: file[:available],
              filename: file[:filename],
              content_type: file[:content_type],
              byte_size: file[:byte_size],
              expires_in_seconds: file[:expires_in_seconds]
            }.compact
          )
        rescue StandardError => e
          Rails.logger.warn("[TrustSafety] document access audit failed document_id=#{doc.id}: #{e.class}: #{e.message}")
        end

        def find_item!(item_type, id)
          model = ITEM_TYPES[item_type.to_s]
          raise ActiveRecord::RecordNotFound unless model

          record = model.find(id)
          raise ActiveRecord::RecordNotFound if record.is_a?(Document) && !reviewable_document?(record)

          record
        end

        def reviewable_document?(doc)
          doc.uploadable_type == "TechnicianProfile" && TrustSafety::DocumentPolicy::REVIEWABLE_TYPES.include?(doc.doc_type.to_s)
        end

        def owner_user_for(record)
          case record
          when BackgroundCheck then record.user
          when VerificationReference then record.technician_user
          when Document then resolve_document_owner_user(record)
          end
        end

        def serialize_item(record, detail: false)
          owner = owner_user_for(record)
          identity = TrustSafety::TechnicianIdentity.for(owner)
          case record
          when BackgroundCheck
            TrustSafety::ItemSerializer.background_check(record, identity: identity, detail: detail)
          when Document
            file_access = detail ? TrustSafety::DocumentFileAccess.for(record) : nil
            TrustSafety::ItemSerializer.document(record, identity: identity, detail: detail, file_access: file_access)
          when VerificationReference
            TrustSafety::ItemSerializer.reference(record, identity: identity, detail: detail)
          end
        end

        def item_audit(record)
          VerificationAuditLog.includes(:actor_user).where(entity_type: record.class.name, entity_id: record.id)
                              .order(created_at: :desc, id: :desc).limit(100)
                              .map { |row| TrustSafety::AuditFeed.serialize(row) }
        end

        def verification_completion_rate
          total = TechnicianProfile.count
          return 0.0 if total.zero?

          completed = VerificationProfile.where(background_status: :verified).count
          ((completed.to_f / total) * 100).round(1)
        end

        def find_technician_user!(user_id)
          user = User.find(user_id)
          raise ActiveRecord::RecordNotFound, "Technician not found" unless user.technician? && user.technician_profile.present?

          user
        end

        def reference_write_params
          params.permit(:full_name, :email, :phone, :company_name, :relationship).to_h
        end

        def credential_write_params
          params.permit(
            :doc_type, :title, :credential_name, :trade, :issuer, :document_number,
            :state, :issuing_state, :issued_on, :valid_until, :verification_method, :admin_notes
          ).to_h
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

          if doc.doc_type.to_s.in?(%w[identity drivers_license passport])
            if doc.approved?
              profile.update!(identity_status: :verified, last_verified_at: Time.current)
              VerificationBadge.set_active!(user: owner_user, badge_type: "identity_verified", source: doc, expires_at: doc.valid_until)
            elsif doc.rejected?
              profile.update!(identity_status: :rejected)
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

        def serialize_checks(scope)
          scope.map do |check|
            user = check.user
            {
              id: check.id,
              user_id: check.user_id,
              technician_email: user&.email,
              technician_name: [user&.first_name, user&.last_name].compact.join(" ").presence,
              job_id: check.job_id,
              job_application_id: check.job_application_id,
              company_profile_id: check.company_profile_id,
              status: check.status,
              normalized_status: check.normalized_status_value,
              technician_status_label: check.technician_visible_status_label,
              admin_status_label: check.admin_visible_status_label,
              result: check.result,
              provider_status: check.provider_status,
              provider_assess_status: check.provider_assess_status,
              provider_adjudication: check.provider_adjudication,
              provider_includes_canceled: check.provider_includes_canceled,
              provider_updated_at: check.provider_updated_at,
              provider_candidate_id: check.provider_candidate_id,
              provider_invitation_id: check.provider_invitation_id,
              provider_report_id: check.provider_report_id,
              package_name: check.package_name,
              node_custom_id: check.node_custom_id,
              work_location_country: check.work_location_country,
              work_location_state: check.work_location_state,
              work_location_city: check.work_location_city,
              invitation_url: check.invitation_url,
              # Admin-only Checkr dashboard link; never expose criminal detail payloads.
              dashboard_url: check.dashboard_url,
              report_eta_at: check.report_eta_at,
              last_webhook_event_id: check.last_webhook_event_id,
              payment_status: check.payment_status,
              paid_by: check.paid_by,
              admin_override_status: check.admin_override_status,
              admin_notes: check.admin_notes,
              invitation_outcome_unknown: check.admin_notes.to_s.start_with?("INVITATION_OUTCOME_UNKNOWN:"),
              started_at: check.started_at,
              completed_at: check.completed_at,
              created_at: check.created_at,
              updated_at: check.updated_at,
              # Safe investigation/resend is via override endpoint or technician start after expiry.
              safe_actions: {
                manual_override: true,
                resend_if_expired: check.normalized_status_value.in?(%w[invitation_expired invitation_deleted canceled report_canceled])
              }
            }
          end
        end

        def serialize_webhook_anomalies(scope)
          scope.map do |row|
            {
              id: row.id,
              checkr_event_id: row.checkr_event_id,
              event_type: row.event_type,
              object_type: row.object_type,
              object_id: row.object_id,
              background_check_id: row.background_check_id,
              processing_error: row.processing_error,
              attempt_count: row.attempt_count,
              processed_at: row.processed_at,
              received_at: row.received_at,
              updated_at: row.updated_at
            }
          end
        end

        # Document has both a `file` column and `has_one_attached :file`. Rendering the
        # AR objects directly recurses through ActiveStorage's blob association.
        def serialize_documents(scope)
          scope.map do |doc|
            {
              id: doc.id,
              doc_type: doc.doc_type,
              uploadable_type: doc.uploadable_type,
              uploadable_id: doc.uploadable_id,
              status: doc.status,
              issuer: doc.issuer,
              valid_until: doc.valid_until,
              created_at: doc.created_at
            }
          end
        end

        def serialize_references(scope)
          scope.map do |ref|
            {
              id: ref.id,
              full_name: ref.full_name,
              relationship: ref.relationship,
              email: ref.email,
              status: ref.status
            }
          end
        end

        def serialize_audit_events(scope)
          scope.map do |evt|
            {
              id: evt.id,
              action: evt.action,
              user_id: evt.user_id,
              actor_user_id: evt.actor_user_id,
              entity_type: evt.entity_type,
              entity_id: evt.entity_id,
              created_at: evt.created_at
            }
          end
        end
      end
    end
  end
end
