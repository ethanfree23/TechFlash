# frozen_string_literal: true

module Ai
  class ActionExecutor
    ALLOWED = TechnicianVerificationAgent::ACTION_TYPES
    MAX_URL = 2000

    Result = Struct.new(:accepted, :rejected, :needs_human, :complete_requested, keyword_init: true)

    def self.call(**attrs)
      new(**attrs).call
    end

    def initialize(user:, session:, inventory:, actions:, inbound_urls: [], persist: true)
      @user = user
      @session = session
      @inventory = inventory
      @actions = Array(actions)
      @inbound_urls = Array(inbound_urls).map { |url| url.to_s.strip }.reject(&:blank?).uniq
      @persist = persist
      @accepted = []
      @rejected = []
      @needs_human = false
      @complete_requested = false
    end

    def call
      @actions.each { |action| execute_one(action.to_h.stringify_keys) }
      Result.new(
        accepted: @accepted,
        rejected: @rejected,
        needs_human: @needs_human,
        complete_requested: @complete_requested
      )
    end

    private

    def execute_one(action)
      type = action["type"].to_s
      unless ALLOWED.include?(type)
        return reject(action, "unsupported action")
      end

      case type
      when "no_action"
        accept(action)
      when "set_trade_credential_presence"
        set_presence(action)
      when "save_trade_license_details"
        save_license(action)
      when "attach_trade_license_photo"
        attach_photo(action)
      when "save_professional_reference"
        save_reference(action)
      when "send_background_check_reminder"
        reminder(action)
      when "complete_session"
        @complete_requested = true
        accept(action)
      when "needs_human"
        @needs_human = true
        accept(action.merge("reason" => action["reason"].to_s.truncate(240).presence))
      end
    end

    def set_presence(action)
      unless @persist
        return reject(action, "persist not allowed on this turn")
      end

      value = action["has_trade_credential"]
      unless [true, false].include?(value)
        return reject(action, "has_trade_credential must be true or false")
      end

      profile = owned_profile!
      TechnicianTradeCredentialUpdater.set_presence!(profile: profile, has_credential: value)
      accept(action)
    rescue TechnicianTradeCredentialUpdater::Error, ArgumentError => e
      reject(action, e.message)
    end

    def save_license(action)
      unless @persist
        return reject(action, "persist not allowed on this turn")
      end

      title = action["title"].to_s.strip.presence
      number = action["document_number"].to_s.strip.presence
      image = fetched_image_for(action["photo_url"])
      if title.blank? && number.blank? && image.blank?
        return reject(action, "title, number, or inbound photo required")
      end

      TechnicianTradeCredentialUpdater.save_details!(
        profile: owned_profile!,
        title: title,
        document_number: number,
        image: image
      )
      accept(action.except("photo_url").merge("has_image" => image.present?))
    rescue TechnicianTradeCredentialUpdater::Error, GhlRemoteImageFetcher::Error => e
      reject(action, e.message)
    end

    def attach_photo(action)
      unless @persist
        return reject(action, "persist not allowed on this turn")
      end

      image = fetched_image_for(action["photo_url"])
      if image.blank?
        return reject(action, "inbound license photo is required")
      end

      TechnicianTradeCredentialUpdater.save_details!(
        profile: owned_profile!,
        title: action["title"],
        document_number: action["document_number"],
        image: image
      )
      accept(action.except("photo_url").merge("has_image" => true))
    rescue TechnicianTradeCredentialUpdater::Error, GhlRemoteImageFetcher::Error => e
      reject(action, e.message)
    end

    def save_reference(action)
      unless @persist
        return reject(action, "persist not allowed on this turn")
      end

      merged = merge_pending_reference(action)
      if @inventory.dig(:professional_references, :complete) || @inventory.dig("professional_references", "complete")
        return reject(action, "reference target already met")
      end

      result = TechnicianReferenceUpserter.call(user: @user, attrs: merged)
      unless result.ok
        @session.write_pending_reference!(merged.except("type"))
        return reject(action.merge("missing" => result.missing), result.error)
      end

      @session.write_pending_reference!({})
      accept(action.merge("created" => result.created, "duplicate" => result.duplicate, "reference_id" => result.reference&.id))
    end

    def reminder(action)
      background = @inventory[:background_check] || @inventory["background_check"] || {}
      actionable = background[:technician_actionable] || background["technician_actionable"]
      unless actionable
        return reject(action, "background check is not technician-actionable")
      end

      accept(action)
    end

    def merge_pending_reference(action)
      pending = @session.pending_reference
      %w[full_name company phone email].each_with_object(pending.dup) do |key, hash|
        value = action[key].to_s.strip.presence
        hash[key] = value if value.present?
      end
    end

    def fetched_image_for(photo_url)
      url = allowed_inbound_url(photo_url)
      return nil if url.blank?

      GhlRemoteImageFetcher.fetch(url)
    end

    def allowed_inbound_url(photo_url)
      candidate = photo_url.to_s.strip.presence
      if candidate.present?
        return nil if candidate.length > MAX_URL
        return candidate if @inbound_urls.include?(candidate)
        return nil
      end
      @inbound_urls.first
    end

    def owned_profile!
      profile = @user.technician_profile
      raise TechnicianTradeCredentialUpdater::Error, "technician profile is required" if profile.blank?
      raise TechnicianTradeCredentialUpdater::Error, "cross-user action blocked" if profile.user_id != @user.id

      profile
    end

    def accept(action)
      @accepted << compact_action(action)
    end

    def reject(action, reason)
      @rejected << compact_action(action).merge("rejected_reason" => reason.to_s.truncate(240))
    end

    def compact_action(action)
      data = action.to_h.stringify_keys.slice(
        "type", "has_trade_credential", "title", "document_number", "full_name",
        "company", "phone", "email", "reason", "created", "duplicate", "reference_id",
        "has_image", "missing"
      ).reject { |_k, v| v.nil? || v == "" }
      data["phone"] = "[present]" if data["phone"].present?
      data["email"] = "[present]" if data["email"].present?
      data
    end
  end
end
