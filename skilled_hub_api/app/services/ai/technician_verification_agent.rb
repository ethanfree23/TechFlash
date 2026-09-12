# frozen_string_literal: true

module Ai
  class TechnicianVerificationAgent
    ACTION_TYPES = %w[
      no_action
      set_trade_credential_presence
      save_trade_license_details
      attach_trade_license_photo
      save_professional_reference
      send_background_check_reminder
      complete_session
      needs_human
    ].freeze

    RESPONSE_SCHEMA = {
      "type" => "object",
      "additionalProperties" => false,
      "required" => %w[reply actions needs_human],
      "properties" => {
        "reply" => { "type" => "string" },
        "needs_human" => { "type" => "boolean" },
        "actions" => {
          "type" => "array",
          "items" => {
            "type" => "object",
            "additionalProperties" => false,
            "required" => %w[
              type has_trade_credential title document_number photo_url
              full_name company phone email reason
            ],
            "properties" => {
              "type" => { "type" => "string", "enum" => ACTION_TYPES },
              "has_trade_credential" => { "type" => %w[boolean null] },
              "title" => { "type" => %w[string null] },
              "document_number" => { "type" => %w[string null] },
              "photo_url" => { "type" => %w[string null] },
              "full_name" => { "type" => %w[string null] },
              "company" => { "type" => %w[string null] },
              "phone" => { "type" => %w[string null] },
              "email" => { "type" => %w[string null] },
              "reason" => { "type" => %w[string null] }
            }
          }
        }
      }
    }.freeze

    SYSTEM_PROMPT = <<~PROMPT.freeze
      You are TechFlash onboarding support texting a technician by SMS.

      Goals:
      - Collect only the verification information that is still missing.
      - Sound like a helpful human coworker: short, conversational, specific.
      - Ask for one main thing at a time.
      - Never mention internal database terms like inventory, canonical, or payload.

      Hard rules:
      - Canonical TechFlash database state is the source of truth. Never invent or declare verification status.
      - Never say the technician is fully verified, hired, approved, or that they "passed" a background check.
      - Never promise jobs, pay, employment, legal rights, or guaranteed verification.
      - Never execute or invent URLs, SQL, or code. Only return the structured actions listed.
      - License/reference number is optional. Do not invent one.
      - Professional references: need 3. Each needs name plus phone or email. Company is helpful but not required to save.
      - Do not save a reference that is already stored.
      - Background check: you cannot run Checkr or change its status.
        * incomplete / not started / canceled / failed: briefly explain they still need to complete it and include the provided action URL if present.
        * invitation sent / action required: remind them to finish it and include the invitation URL if present.
        * processing / pending: do NOT keep asking. Tell them it is processing and move on.
        * clear: do not discuss it as a remaining task.
        * consider / review / disputed / adverse: do not interpret the report. Set needs_human true and stop asking about it.
      - If they ask a basic "why do you need this?" question, answer in one short sentence, then return to the missing item.
      - If you are uncertain or they need a human, set needs_human true.
      - If they sent an unsupported image, tell them JPEG, PNG, WebP, GIF, or BMP are accepted.
      - Keep the SMS reply under 320 characters when possible, never over 1600.
      - If collection from the technician is complete (including when only a processing background check remains), thank them, say there is nothing else they need to send, and use complete_session. Do not claim they are fully verified.
    PROMPT

    def self.call(**attrs)
      new(**attrs).call
    end

    def initialize(inventory:, inbound:, history:, pending_reference: {}, extra: {})
      @inventory = inventory
      @inbound = inbound || {}
      @history = Array(history)
      @pending_reference = pending_reference || {}
      @extra = extra || {}
    end

    def call
      result = Client.generate_structured(
        system: SYSTEM_PROMPT,
        user: user_payload,
        schema: RESPONSE_SCHEMA
      )
      return result unless result.ok

      data = normalize(result.data)
      Client::Result.new(ok: true, data: data, raw: result.raw)
    end

    private

    def user_payload
      {
        event: @inbound[:kind] || @inbound["kind"] || "inbound_reply",
        technician_first_name: @extra[:first_name],
        inventory: InventoryPresenter.sanitize(@inventory),
        inbound_message: @inbound[:body] || @inbound["body"],
        inbound_attachments: Array(@inbound[:attachments] || @inbound["attachments"]),
        attachment_error: @inbound[:attachment_error] || @inbound["attachment_error"],
        pending_partial_reference: @pending_reference,
        recent_messages: @history,
        allowed_actions: ACTION_TYPES,
        background_check_action_url: @extra[:verification_url],
        background_check_invitation_url: @extra[:invitation_url],
        accepted_image_types: %w[JPEG PNG WebP GIF BMP]
      }
    end

    def normalize(data)
      hash = data.to_h.deep_stringify_keys
      actions = Array(hash["actions"]).map { |action| action.to_h.stringify_keys }
      actions = [{ "type" => "no_action" }] if actions.empty?
      {
        "reply" => hash["reply"].to_s.strip,
        "needs_human" => hash["needs_human"] == true,
        "actions" => actions
      }
    end
  end
end
