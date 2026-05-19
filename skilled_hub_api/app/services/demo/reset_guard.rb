# frozen_string_literal: true

module Demo
  class ResetGuard
    def self.verify!
      DemoMode.assert_reset_allowed!
    end
  end
end
