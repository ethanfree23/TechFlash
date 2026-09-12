# frozen_string_literal: true

module Ai
  class Client
    Result = Struct.new(:ok, :data, :error, :raw, keyword_init: true)

    def self.generate_structured(system:, user:, schema:, **opts)
      adapter.generate_structured(system: system, user: user, schema: schema, **opts)
    end

    def self.adapter
      @adapter || default_adapter
    end

    def self.adapter=(value)
      @adapter = value
    end

    def self.reset_adapter!
      @adapter = nil
    end

    def self.configured?
      adapter.present? && adapter.configured?
    end

    def self.default_adapter
      if OpenAiAdapter.configured?
        OpenAiAdapter.new
      else
        NullAdapter.new
      end
    end
  end
end
