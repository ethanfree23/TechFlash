# frozen_string_literal: true

require "test_helper"

class GhlIntakeParserTest < ActiveSupport::TestCase
  test "prefers payload email over contact-info email" do
    parsed = GhlIntakeParser.parse(
      email: "payload@example.com",
      contact_info: "other@example.com / 77002"
    )

    assert_equal "payload@example.com", parsed[:email]
    assert_equal "77002", parsed[:zip_code]
  end

  test "parses slash format email and zip" do
    parsed = GhlIntakeParser.parse(
      email: nil,
      contact_info: "tech@example.com / 77002"
    )

    assert_equal "tech@example.com", parsed[:email]
    assert_equal "77002", parsed[:zip_code]
  end

  test "parses labeled newlines" do
    parsed = GhlIntakeParser.parse(
      email: "",
      contact_info: "Email: john@email.com\nZIP: 77002"
    )

    assert_equal "john@email.com", parsed[:email]
    assert_equal "77002", parsed[:zip_code]
  end

  test "downcases parsed email and ignores punctuation" do
    parsed = GhlIntakeParser.parse(
      email: "  John.Smith@Email.COM  ",
      contact_info: "zip code — 75201."
    )

    assert_equal "john.smith@email.com", parsed[:email]
    assert_equal "75201", parsed[:zip_code]
  end

  test "returns nils when nothing parseable" do
    parsed = GhlIntakeParser.parse(email: "not-an-email", contact_info: "hello")

    assert_nil parsed[:email]
    assert_nil parsed[:zip_code]
  end
end
