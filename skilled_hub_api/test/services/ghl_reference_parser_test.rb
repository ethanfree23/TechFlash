# frozen_string_literal: true

require "test_helper"

class GhlReferenceParserTest < ActiveSupport::TestCase
  test "parses name phone company and relationship" do
    refs = GhlReferenceParser.parse(
      "1. Sam Jones, 7135551111, ABC Plumbing, supervisor; 2. Mike Lee, 7135552222; 3. Chris Brown, 7135553333, coworker"
    )

    assert_equal 3, refs.size
    assert_equal "Sam Jones", refs[0][:full_name]
    assert_equal "7135551111", refs[0][:phone]
    assert_equal "ABC Plumbing", refs[0][:company_name]
    assert_equal "supervisor", refs[0][:relationship]

    assert_equal "Mike Lee", refs[1][:full_name]
    assert_equal "7135552222", refs[1][:phone]
    assert_nil refs[1][:company_name]
    assert_nil refs[1][:relationship]

    assert_equal "Chris Brown", refs[2][:full_name]
    assert_equal "7135553333", refs[2][:phone]
    assert_equal "coworker", refs[2][:company_name]
    assert_nil refs[2][:relationship]
  end

  test "parses newline name plus phone only rows" do
    refs = GhlReferenceParser.parse("Sam Boss, 7135551111\nMike Lee, 713-555-2222")

    assert_equal 2, refs.size
    assert_equal "Sam Boss", refs[0][:full_name]
    assert_equal "7135551111", refs[0][:phone]
    assert_equal "Mike Lee", refs[1][:full_name]
  end

  test "parses optional company and relationship on newlines" do
    refs = GhlReferenceParser.parse(
      "1) Sam Boss, 7135551111, ABC Plumbing, supervisor\n2) Riley Chen, 555-222-1111"
    )

    assert_equal 2, refs.size
    assert_equal "ABC Plumbing", refs[0][:company_name]
    assert_equal "supervisor", refs[0][:relationship]
    assert_nil refs[1][:company_name]
  end

  test "skips rows without a name or phone and does not crash on messy extras" do
    refs = GhlReferenceParser.parse("7135551111\nJust a name\nAlex Patil, 5553334444, former coworker!!!")

    assert_equal 1, refs.size
    assert_equal "Alex Patil", refs[0][:full_name]
    assert_equal "former coworker!!!", refs[0][:company_name]
  end

  test "returns empty array for blank input" do
    assert_equal [], GhlReferenceParser.parse(nil)
    assert_equal [], GhlReferenceParser.parse("   ")
  end
end
