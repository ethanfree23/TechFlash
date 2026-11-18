# frozen_string_literal: true

module TrustSafety
  # Admin create/update/destroy for technician verification records (references +
  # trade credentials). Review/approve decisions stay on TrustSafetyController.
  # New records never auto-verify — status stays requested / pending_review.
  class AdminVerificationRecords
    MAX_REFERENCES = AdminTechnicianProfileUpdater::MAX_REFERENCES
    MAX_CREDENTIALS = AdminTechnicianProfileUpdater::MAX_LICENSES
    CREDENTIAL_DOC_TYPES = DocumentPolicy::CREDENTIAL_TYPES
    DEFAULT_CREDENTIAL_DOC_TYPE = "certificate"
    DEFAULT_RELATIONSHIP = AdminTechnicianProfileUpdater::DEFAULT_RELATIONSHIP

    Result = Struct.new(:ok, :record, :errors, :trust_profile, keyword_init: true)

    def self.create_reference(technician_user:, attrs:, actor:)
      new(technician_user: technician_user, actor: actor).create_reference(attrs)
    end

    def self.update_reference(reference:, attrs:, actor:)
      new(technician_user: reference.technician_user, actor: actor).update_reference(reference, attrs)
    end

    def self.destroy_reference(reference:, actor:, confirm: false)
      new(technician_user: reference.technician_user, actor: actor).destroy_reference(reference, confirm: confirm)
    end

    def self.create_credential(technician_user:, attrs:, file: nil, actor:)
      new(technician_user: technician_user, actor: actor).create_credential(attrs, file: file)
    end

    def self.update_credential(document:, attrs:, file: nil, actor:)
      owner = document.uploadable.is_a?(TechnicianProfile) ? document.uploadable.user : nil
      new(technician_user: owner, actor: actor).update_credential(document, attrs, file: file)
    end

    def initialize(technician_user:, actor:)
      @technician_user = technician_user
      @actor = actor
    end

    def create_reference(attrs)
      return failure(["Technician profile is required"]) unless technician_profile
      return failure(["A technician can have at most #{MAX_REFERENCES} professional references"]) if reference_count >= MAX_REFERENCES

      parsed = parse_reference_attrs(attrs)
      return failure(parsed[:errors]) if parsed[:errors]

      ref = @technician_user.verification_references_as_technician.build(
        status: :requested,
        requested_at: Time.current,
        relationship: parsed[:relationship] || DEFAULT_RELATIONSHIP,
        full_name: parsed[:full_name],
        email: parsed[:email],
        phone: parsed[:phone],
        company_name: parsed[:company_name]
      )
      ref.save!
      audit!(ref, "reference_admin_created", {
        full_name: ref.full_name,
        company_name: ref.company_name,
        relationship: ref.relationship,
        source: "admin_verification_workspace"
      })
      success(ref)
    rescue ActiveRecord::RecordInvalid => e
      failure(e.record.errors.full_messages.presence || [e.message])
    rescue ActiveRecord::RecordNotUnique => e
      failure(unique_constraint_errors(e))
    rescue ArgumentError => e
      failure([e.message])
    end

    def update_reference(ref, attrs)
      return failure(["Reference not found"]) unless ref
      return failure(["Cannot edit a reference for another technician"]) unless ref.technician_user_id == @technician_user.id

      parsed = parse_reference_attrs(attrs, require_name: false)
      return failure(parsed[:errors]) if parsed[:errors]

      before = snapshot_reference(ref)
      ref.full_name = parsed[:full_name] if parsed.key?(:full_name)
      ref.email = parsed[:email] if parsed.key?(:email)
      ref.phone = parsed[:phone] if parsed.key?(:phone)
      ref.company_name = parsed[:company_name] if parsed.key?(:company_name)
      ref.relationship = parsed[:relationship] if parsed.key?(:relationship) && parsed[:relationship].present?
      if ref.email.blank? && ref.phone.blank?
        return failure(["Each reference needs an email or phone"])
      end
      ref.save!
      audit!(ref, "reference_admin_updated", { before: before, after: snapshot_reference(ref) })
      success(ref)
    rescue ActiveRecord::RecordInvalid => e
      failure(e.record.errors.full_messages.presence || [e.message])
    rescue ActiveRecord::RecordNotUnique => e
      failure(unique_constraint_errors(e))
    rescue ArgumentError => e
      failure([e.message])
    end

    def destroy_reference(ref, confirm: false)
      return failure(["Reference not found"]) unless ref
      return failure(["Cannot remove a reference for another technician"]) unless ref.technician_user_id == @technician_user.id

      if (ref.approved? || ref.rejected?) && !confirm
        return failure(["Confirm removal of a decided reference. Pass confirm=true to proceed."])
      end

      snapshot = snapshot_reference(ref)
      audit!(ref, "reference_admin_destroyed", {
        reference: snapshot,
        confirmed: confirm == true
      })
      ref.destroy!
      success(nil)
    rescue ActiveRecord::RecordNotDestroyed => e
      failure([e.message])
    end

    def create_credential(attrs, file: nil)
      return failure(["Technician profile is required"]) unless technician_profile
      return failure(["A technician can have at most #{MAX_CREDENTIALS} credentials"]) if credential_count >= MAX_CREDENTIALS

      parsed = parse_credential_attrs(attrs)
      return failure(parsed[:errors]) if parsed[:errors]
      if file.blank? && parsed[:document_number].blank? && parsed[:issuer].blank? && parsed[:title].blank?
        return failure(["Provide credential details or upload a document"])
      end

      doc = technician_profile.documents.build(
        doc_type: parsed[:doc_type],
        status: :pending_review,
        issuer: parsed[:issuer],
        document_number: parsed[:document_number],
        issued_on: parsed[:issued_on],
        valid_until: parsed[:valid_until],
        metadata: parsed[:metadata]
      )
      attach_file!(doc, file) if uploaded_file?(file)
      doc.save!
      audit!(doc, "document_admin_created", {
        doc_type: doc.doc_type,
        issuer: doc.issuer,
        document_number: doc.document_number,
        has_file: doc.file.attached?,
        source: "admin_verification_workspace"
      })
      success(doc)
    rescue ActiveRecord::RecordInvalid => e
      failure(e.record.errors.full_messages.presence || [e.message])
    rescue ArgumentError => e
      failure([e.message])
    end

    def update_credential(doc, attrs, file: nil)
      return failure(["Credential not found"]) unless doc
      return failure(["Document is not a trade credential"]) unless CREDENTIAL_DOC_TYPES.include?(doc.doc_type.to_s)
      return failure(["Cannot edit a credential for another technician"]) unless doc.uploadable == technician_profile

      parsed = parse_credential_attrs(attrs, require_type: false)
      return failure(parsed[:errors]) if parsed[:errors]

      before = snapshot_credential(doc)
      doc.doc_type = parsed[:doc_type] if parsed[:doc_type].present?
      doc.issuer = parsed[:issuer] if parsed.key?(:issuer)
      doc.document_number = parsed[:document_number] if parsed.key?(:document_number)
      doc.issued_on = parsed[:issued_on] if parsed.key?(:issued_on)
      doc.valid_until = parsed[:valid_until] if parsed.key?(:valid_until)
      if parsed.key?(:metadata)
        meta = doc.metadata.is_a?(Hash) ? doc.metadata.deep_dup : {}
        doc.metadata = meta.merge(parsed[:metadata])
      end
      attach_file!(doc, file) if uploaded_file?(file)
      # Replacing a file or editing details after a decision should return it to review.
      if doc.approved? || doc.rejected?
        if uploaded_file?(file) || credential_fields_changed?(before, doc)
          doc.status = :pending_review
          doc.reviewed_by_user = nil
          doc.reviewed_at = nil
          doc.rejection_reason = nil
        end
      end
      doc.save!
      audit!(doc, "document_admin_updated", { before: before, after: snapshot_credential(doc) })
      success(doc)
    rescue ActiveRecord::RecordInvalid => e
      failure(e.record.errors.full_messages.presence || [e.message])
    rescue ArgumentError => e
      failure([e.message])
    end

    private

    def technician_profile
      @technician_profile ||= @technician_user&.technician_profile
    end

    def reference_count
      VerificationReference.where(technician_user_id: @technician_user.id).count
    end

    def credential_count
      technician_profile.documents.where(doc_type: CREDENTIAL_DOC_TYPES).count
    end

    def parse_reference_attrs(attrs, require_name: true)
      hash = (attrs || {}).with_indifferent_access
      out = {}
      errors = []

      if hash.key?(:full_name) || require_name
        name = hash[:full_name].to_s.strip
        errors << "Reference name is required" if name.blank? && require_name
        out[:full_name] = name if hash.key?(:full_name) || require_name
      end

      %i[email phone company_name relationship].each do |key|
        next unless hash.key?(key)

        out[key] = hash[key].to_s.strip.presence
      end

      if require_name || out.key?(:email) || out.key?(:phone)
        email = out.key?(:email) ? out[:email] : hash[:email].to_s.strip.presence
        phone = out.key?(:phone) ? out[:phone] : hash[:phone].to_s.strip.presence
        # When creating, require contact. When updating partial fields, validate after merge in update_reference.
        if require_name && email.blank? && phone.blank?
          errors << "Each reference needs an email or phone"
        end
      end

      return { errors: errors } if errors.any?

      out
    end

    def parse_credential_attrs(attrs, require_type: true)
      hash = (attrs || {}).with_indifferent_access
      errors = []
      out = {}

      if hash.key?(:doc_type) || require_type
        type = hash[:doc_type].to_s.strip.presence || DEFAULT_CREDENTIAL_DOC_TYPE
        type = "certificate" if type == "cert"
        unless CREDENTIAL_DOC_TYPES.include?(type)
          errors << "Credential type must be license or certificate"
        end
        out[:doc_type] = type
      end

      %i[issuer document_number].each do |key|
        next unless hash.key?(key)

        out[key] = hash[key].to_s.strip.presence
      end

      if hash.key?(:issued_on)
        out[:issued_on] = parse_date(hash[:issued_on], "Issue date")
        errors << out[:issued_on] if out[:issued_on].is_a?(String) && out[:issued_on].include?("invalid")
        out.delete(:issued_on) if out[:issued_on].is_a?(String)
      end
      if hash.key?(:valid_until)
        out[:valid_until] = parse_date(hash[:valid_until], "Expiration date")
        errors << out[:valid_until] if out[:valid_until].is_a?(String) && out[:valid_until].include?("invalid")
        out.delete(:valid_until) if out[:valid_until].is_a?(String)
      end

      meta = {}
      title = hash[:title].to_s.strip.presence || hash[:credential_name].to_s.strip.presence
      meta["title"] = title if title || hash.key?(:title) || hash.key?(:credential_name)
      meta["trade"] = hash[:trade].to_s.strip.presence if hash.key?(:trade)
      state = hash[:state].to_s.strip.presence || hash[:issuing_state].to_s.strip.presence
      if hash.key?(:state) || hash.key?(:issuing_state)
        meta["state"] = state
        meta["issuing_state"] = state
      end
      if hash.key?(:verification_method)
        method = hash[:verification_method].to_s.strip.presence
        if method.present? && !%w[document_review issuing_authority].include?(method)
          errors << "verification_method must be document_review or issuing_authority"
        else
          meta["verification_method"] = method
        end
      end
      if hash.key?(:admin_notes)
        meta["admin_notes"] = hash[:admin_notes].to_s.strip.presence
      end
      out[:metadata] = meta if meta.any?
      out[:title] = title

      return { errors: errors } if errors.any?

      out
    end

    def parse_date(value, label)
      return nil if value.blank?

      Date.parse(value.to_s)
    rescue ArgumentError, TypeError
      "#{label} is invalid"
    end

    def attach_file!(doc, file)
      raise ArgumentError, "Uploaded file is invalid" unless uploaded_file?(file)

      content_type = file.respond_to?(:content_type) ? file.content_type.to_s : ""
      allowed = content_type.blank? || content_type.match?(%r{\A(image/(jpeg|png|jpg|webp)|application/pdf)\z}i)
      raise ArgumentError, "Credential file must be a JPEG, PNG, WebP, or PDF" unless allowed

      doc.file.purge if doc.file.attached?
      doc.file.attach(file)
    end

    def uploaded_file?(value)
      return false if value.blank?

      value.respond_to?(:tempfile) || value.respond_to?(:original_filename)
    end

    def credential_fields_changed?(before, doc)
      before[:issuer] != doc.issuer ||
        before[:document_number] != doc.document_number ||
        before[:doc_type] != doc.doc_type ||
        before[:issued_on] != doc.issued_on&.iso8601 ||
        before[:valid_until] != doc.valid_until&.iso8601
    end

    def snapshot_reference(ref)
      {
        id: ref.id,
        full_name: ref.full_name,
        email: ref.email,
        phone: ref.phone,
        company_name: ref.company_name,
        relationship: ref.relationship,
        status: ref.status
      }
    end

    def snapshot_credential(doc)
      {
        id: doc.id,
        doc_type: doc.doc_type,
        issuer: doc.issuer,
        document_number: doc.document_number,
        issued_on: doc.issued_on&.iso8601,
        valid_until: doc.valid_until&.iso8601,
        status: doc.status,
        metadata: doc.metadata.is_a?(Hash) ? doc.metadata.slice("title", "trade", "state", "issuing_state", "verification_method", "admin_notes") : {},
        has_file: doc.file.attached?
      }
    end

    def audit!(entity, action, details)
      VerificationAuditLog.record!(
        user: @technician_user,
        actor_user: @actor,
        entity: entity,
        action: action,
        details: details
      )
    end

    def unique_constraint_errors(error)
      message = error.message.to_s
      if message.include?("email_normalized")
        ["Email has already been used for another reference"]
      elsif message.include?("phone_normalized")
        ["Phone has already been used for another reference"]
      else
        ["Unable to save because a unique value is already in use"]
      end
    end

    def success(record)
      Result.new(ok: true, record: record, errors: [], trust_profile: TrustProfile.call(@technician_user))
    end

    def failure(errors)
      Result.new(ok: false, record: nil, errors: Array(errors), trust_profile: nil)
    end
  end
end
