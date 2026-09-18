# frozen_string_literal: true

require "test_helper"

module Assessments
  class ScoreBandsTest < ActiveSupport::TestCase
    test "no bands configured is valid and resolves nothing" do
      bands = ScoreBands.new([])

      assert bands.valid?
      assert_not bands.present?
      assert_nil bands.resolve(80)
      assert_nil bands.label_for(80)
    end

    test "the starter template covers every score exactly once" do
      bands = ScoreBands.new(ScoreBands.starter_template)

      assert bands.valid?
      (0..100).each do |score|
        matches = bands.bands.count { |band| score >= band["min_score"] && score <= band["max_score"] }
        assert_equal 1, matches, "score #{score} matched #{matches} bands"
      end
    end

    test "resolution is correct at band boundaries" do
      bands = ScoreBands.new(ScoreBands.starter_template)

      assert_equal "Foundational", bands.label_for(0)
      assert_equal "Foundational", bands.label_for(39)
      assert_equal "Developing", bands.label_for(40)
      assert_equal "Apprentice", bands.label_for(60)
      assert_equal "Advanced Apprentice", bands.label_for(75)
      assert_equal "Advanced Apprentice", bands.label_for(89)
      assert_equal "Strong Knowledge", bands.label_for(90)
      assert_equal "Strong Knowledge", bands.label_for(100)
      assert_equal "advanced_apprentice", bands.slug_for(82)
    end

    test "bands are accepted in any order" do
      bands = ScoreBands.new([
                               { "slug" => "high", "label" => "High", "min_score" => 51, "max_score" => 100 },
                               { "slug" => "low", "label" => "Low", "min_score" => 0, "max_score" => 50 }
                             ])

      assert bands.valid?
      assert_equal "Low", bands.label_for(10)
      assert_equal "High", bands.label_for(90)
    end

    test "a gap in coverage is rejected" do
      bands = ScoreBands.new([
                               { "slug" => "low", "label" => "Low", "min_score" => 0, "max_score" => 40 },
                               { "slug" => "high", "label" => "High", "min_score" => 50, "max_score" => 100 }
                             ])

      assert_not bands.valid?
      assert_match(/41-49 uncovered/, bands.errors.join)
    end

    test "overlapping bands are rejected" do
      bands = ScoreBands.new([
                               { "slug" => "low", "label" => "Low", "min_score" => 0, "max_score" => 60 },
                               { "slug" => "high", "label" => "High", "min_score" => 50, "max_score" => 100 }
                             ])

      assert_not bands.valid?
      assert_match(/overlap/, bands.errors.join)
    end

    test "bands that stop short of 100 are rejected" do
      bands = ScoreBands.new([{ "slug" => "low", "label" => "Low", "min_score" => 0, "max_score" => 90 }])

      assert_not bands.valid?
      assert_match(/cover through 100/, bands.errors.join)
    end

    test "a missing field is rejected" do
      bands = ScoreBands.new([{ "slug" => "low", "min_score" => 0, "max_score" => 100 }])

      assert_not bands.valid?
      assert_match(/missing label/, bands.errors.join)
    end

    test "an inverted range is rejected" do
      bands = ScoreBands.new([{ "slug" => "bad", "label" => "Bad", "min_score" => 80, "max_score" => 20 }])

      assert_not bands.valid?
      assert_match(/must not exceed max_score/, bands.errors.join)
    end

    test "a duplicate slug is rejected" do
      bands = ScoreBands.new([
                               { "slug" => "same", "label" => "A", "min_score" => 0, "max_score" => 50 },
                               { "slug" => "same", "label" => "B", "min_score" => 51, "max_score" => 100 }
                             ])

      assert_not bands.valid?
      assert_match(/duplicated/, bands.errors.join)
    end

    test "symbol keys and a JSON string are both accepted" do
      from_symbols = ScoreBands.new([{ slug: "all", label: "All", min_score: 0, max_score: 100 }])
      from_string = ScoreBands.new('[{"slug":"all","label":"All","min_score":0,"max_score":100}]')

      assert from_symbols.valid?
      assert from_string.valid?
      assert_equal "All", from_symbols.label_for(50)
      assert_equal "All", from_string.label_for(50)
    end

    test "malformed JSON degrades to no bands rather than raising" do
      bands = ScoreBands.new("not json at all")

      assert bands.valid?
      assert_not bands.present?
    end
  end
end
