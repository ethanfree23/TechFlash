# frozen_string_literal: true

require "test_helper"

class GhlPhoneNormalizerTest < ActiveSupport::TestCase
  test "normalize strips formatting and a leading US country code" do
    assert_equal "8325551212", GhlPhoneNormalizer.normalize("+1 (832) 555-1212")
    assert_equal "8325551212", GhlPhoneNormalizer.normalize("+18325551212")
    assert_equal "8325551212", GhlPhoneNormalizer.normalize("832-555-1212")
  end

  test "search_digit_variants match formatted and E.164 queries" do
    assert_includes GhlPhoneNormalizer.search_digit_variants("832"), "832"
    assert_includes GhlPhoneNormalizer.search_digit_variants("(832) 555-1212"), "8325551212"
    assert_includes GhlPhoneNormalizer.search_digit_variants("+18325551212"), "8325551212"
    assert_includes GhlPhoneNormalizer.search_digit_variants("8325551212"), "18325551212"
    assert_empty GhlPhoneNormalizer.search_digit_variants("Ethan")
  end
end
