# frozen_string_literal: true

module Ai
  class InboundMediaHandler
    Result = Struct.new(:ok, :saved, :error, :urls, keyword_init: true)

    def self.call(user:, inventory:, urls:)
      new(user: user, inventory: inventory, urls: urls).call
    end

    def initialize(user:, inventory:, urls:)
      @user = user
      @inventory = inventory
      @urls = Array(urls).map { |url| url.to_s.strip }.reject(&:blank?).uniq
    end

    def call
      return Result.new(ok: true, saved: false, urls: @urls) if @urls.empty?
      return Result.new(ok: true, saved: false, urls: @urls) unless license_photo_needed?

      errors = []
      @urls.each do |url|
        fetched = GhlRemoteImageFetcher.fetch(url)
        TechnicianTradeCredentialUpdater.save_details!(
          profile: @user.technician_profile,
          image: fetched
        )
        return Result.new(ok: true, saved: true, urls: @urls)
      rescue GhlRemoteImageFetcher::Error, TechnicianTradeCredentialUpdater::Error => e
        errors << e.message
      end

      Result.new(ok: false, saved: false, error: errors.last, urls: @urls)
    end

    private

    def license_photo_needed?
      trade = @inventory[:trade_license] || @inventory["trade_license"] || {}
      state = trade[:state] || trade["state"]
      return false if state == "yes" || state == "na"

      docs = Array(trade[:documents] || trade["documents"])
      return true if docs.empty?

      docs.any? { |doc| doc.to_h.stringify_keys["has_file"] != true }
    end
  end
end
