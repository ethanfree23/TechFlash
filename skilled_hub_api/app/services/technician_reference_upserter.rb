# frozen_string_literal: true

class TechnicianReferenceUpserter
  class Error < StandardError; end

  DEFAULT_RELATIONSHIP = "Professional reference"
  MAX_NAME = 120
  MAX_COMPANY = 120
  MAX_EMAIL = 160
  MAX_PHONE = 40
  EMAIL_REGEX = /\A[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\z/i

  Result = Struct.new(:ok, :reference, :created, :duplicate, :error, :missing, keyword_init: true)

  def self.call(user:, attrs:)
    new(user: user, attrs: attrs).call
  end

  def initialize(user:, attrs:)
    @user = user
    @attrs = (attrs || {}).to_h.stringify_keys
  end

  def call
    raise Error, "technician is required" if @user.blank? || !@user.technician?

    full_name = @attrs["full_name"].to_s.strip.truncate(MAX_NAME).presence
    company = @attrs["company"].presence || @attrs["company_name"]
    company = company.to_s.strip.truncate(MAX_COMPANY).presence
    phone = @attrs["phone"].to_s.strip.truncate(MAX_PHONE).presence
    email = GhlIntakeParser.extract_email(@attrs["email"]).to_s.strip.downcase.truncate(MAX_EMAIL).presence
    email = nil if email.present? && email !~ EMAIL_REGEX
    phone_normalized = GhlPhoneNormalizer.normalize(phone)
    phone = nil if phone.present? && phone_normalized.blank?

    missing = []
    missing << "full_name" if full_name.blank?
    missing << "email or phone" if email.blank? && phone_normalized.blank?
    if missing.any?
      return Result.new(ok: false, missing: missing, error: "missing #{missing.join(" and ")}")
    end

    existing = find_existing(phone_normalized: phone_normalized, email: email)
    if existing
      assign_unless_blank(existing, :full_name, full_name)
      assign_unless_blank(existing, :company_name, company)
      assign_unless_blank(existing, :phone, phone)
      assign_unless_blank(existing, :email, email)
      existing.save!
      return Result.new(ok: true, reference: existing, created: false, duplicate: true)
    end

    ref = @user.verification_references_as_technician.create!(
      full_name: full_name,
      phone: phone,
      email: email,
      company_name: company,
      relationship: DEFAULT_RELATIONSHIP,
      status: :requested,
      requested_at: Time.current
    )
    Result.new(ok: true, reference: ref, created: true, duplicate: false)
  rescue ActiveRecord::RecordInvalid => e
    Result.new(ok: false, error: e.record.errors.full_messages.to_sentence)
  rescue ActiveRecord::RecordNotUnique
    Result.new(ok: false, error: "duplicate reference", duplicate: true)
  end

  private

  def find_existing(phone_normalized:, email:)
    scope = @user.verification_references_as_technician
    if phone_normalized.present?
      found = scope.find_by(phone_normalized: phone_normalized)
      return found if found
    end
    return nil if email.blank?

    scope.find_by(email_normalized: email)
  end

  def assign_unless_blank(record, field, value)
    return if value.blank?
    return if record.public_send(field).present?

    record.public_send("#{field}=", value)
  end
end
