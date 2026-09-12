# frozen_string_literal: true

module Ghl
  class ContactResolver
    Result = Struct.new(:ok, :contact_id, :contact, :error, :status, :http_status, :retryable, keyword_init: true)

    def self.call(user:, client: nil)
      new(user: user, client: client).call
    end

    def initialize(user:, client: nil)
      @user = user
      @client = client || ApiClient.new
    end

    def call
      return failure("GHL location is not configured", status: :failed, http_status: :service_unavailable) if GhlConfiguration.location_id.blank?

      existing_id = @user.ghl_contact_id.to_s.strip.presence
      if existing_id
        fetched = @client.get_contact(existing_id)
        if fetched.ok
          contact = extract_contact(fetched.body)
          persist_contact_id!(existing_id)
          return Result.new(ok: true, contact_id: existing_id, contact: contact)
        end
        if fetched.status_code == 404
          return upsert_contact
        end
        return map_client_failure(fetched)
      end

      upsert_contact
    end

    private

    def upsert_contact
      payload = compact_upsert_payload
      if payload[:phone].blank? && payload[:email].blank?
        return failure("Phone or email is required to match a GHL contact", status: :invalid_phone, http_status: :unprocessable_entity)
      end

      response = @client.upsert_contact(payload)
      unless response.ok
        return map_client_failure(response)
      end

      contact = extract_contact(response.body)
      contact_id = contact["id"].presence || contact["contactId"].presence
      if contact_id.blank?
        return failure("GHL upsert did not return a contact id", status: :failed, http_status: :bad_gateway)
      end

      persist_contact_id!(contact_id)
      Result.new(ok: true, contact_id: contact_id, contact: contact)
    end

    def compact_upsert_payload
      payload = {
        locationId: GhlConfiguration.location_id,
        createNewIfDuplicateAllowed: false
      }
      first = @user.first_name.to_s.strip.presence
      last = @user.last_name.to_s.strip.presence
      email = @user.email.to_s.strip.presence
      phone = GhlPhoneNormalizer.e164(@user.phone.presence || @user.technician_profile&.phone || @user.company_profile&.phone)

      payload[:firstName] = first if first
      payload[:lastName] = last if last
      payload[:email] = email if email
      payload[:phone] = phone if phone
      payload
    end

    def extract_contact(body)
      hash = body.is_a?(Hash) ? body.stringify_keys : {}
      inner = hash["contact"]
      inner.is_a?(Hash) ? inner.stringify_keys : hash
    end

    def persist_contact_id!(contact_id)
      return if @user.ghl_contact_id.to_s == contact_id.to_s

      @user.update_column(:ghl_contact_id, contact_id)
      @user.ghl_contact_id = contact_id
    end

    def map_client_failure(response)
      status, http_status = Ghl::ErrorMapper.call(response)
      Result.new(
        ok: false,
        error: response.error,
        status: status,
        http_status: http_status,
        retryable: response.retryable
      )
    end

    def failure(message, status:, http_status:)
      Result.new(ok: false, error: message, status: status, http_status: http_status, retryable: false)
    end
  end
end
