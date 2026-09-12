# frozen_string_literal: true

require "test_helper"

class AiOpenAiAdapterTest < ActiveSupport::TestCase
  setup do
    @previous_key = ENV["OPENAI_API_KEY"]
    @previous_temp = ENV["OPENAI_TEMPERATURE"]
    @previous_model = ENV["OPENAI_MODEL"]
    ENV["OPENAI_API_KEY"] = "sk-test"
    ENV["OPENAI_TEMPERATURE"] = nil
    ENV["OPENAI_MODEL"] = "gpt-5-mini"
  end

  teardown do
    ENV["OPENAI_API_KEY"] = @previous_key
    ENV["OPENAI_TEMPERATURE"] = @previous_temp
    ENV["OPENAI_MODEL"] = @previous_model
  end

  test "does not send temperature by default" do
    captured = nil
    adapter = Ai::OpenAiAdapter.new
    adapter.stub(:post_json, ->(payload) { captured = payload; { ok: false, error: "skip" } }) do
      adapter.generate_structured(system: "s", user: "u", schema: { "type" => "object" })
    end
    refute captured.key?(:temperature)
  end

  test "retries without temperature when the model rejects it" do
    payloads = []
    adapter = Ai::OpenAiAdapter.new
    ENV["OPENAI_TEMPERATURE"] = "0.2"
    adapter.stub(:post_json, lambda { |payload|
      payloads << payload
      if payload.key?(:temperature)
        { ok: false, error: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported." }
      else
        { ok: true, body: { "choices" => [{ "message" => { "content" => "{\"reply\":\"Hi\",\"needs_human\":false,\"actions\":[]}" } }] } }
      end
    }) do
      result = adapter.generate_structured(system: "s", user: "u", schema: { "type" => "object" })
      assert result.ok
    end
    assert_equal 2, payloads.size
    assert payloads.first.key?(:temperature)
    refute payloads.last.key?(:temperature)
  end
end
