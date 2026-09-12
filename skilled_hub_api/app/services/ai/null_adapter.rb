# frozen_string_literal: true

module Ai
  class NullAdapter
    def configured?
      false
    end

    def generate_structured(**_opts)
      Client::Result.new(ok: false, error: "AI provider is not configured")
    end
  end
end
