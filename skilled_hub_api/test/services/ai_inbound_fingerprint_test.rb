# frozen_string_literal: true

require "test_helper"

class AiInboundFingerprintTest < ActiveSupport::TestCase
  test "normalizes whitespace and attachment order" do
    first = Ai::InboundFingerprint.call(
      contact_id: "abc",
      body: "  Yes  please ",
      attachments: ["https://cdn.example/b.png", "https://cdn.example/a.png/"]
    )
    second = Ai::InboundFingerprint.call(
      contact_id: "abc",
      body: "Yes please",
      attachments: ["https://cdn.example/a.png", "https://cdn.example/b.png"]
    )
    assert_equal first, second
  end

  test "different bodies produce different fingerprints" do
    yes = Ai::InboundFingerprint.call(contact_id: "abc", body: "Yes", attachments: [])
    no = Ai::InboundFingerprint.call(contact_id: "abc", body: "No", attachments: [])
    refute_equal yes, no
  end
end
