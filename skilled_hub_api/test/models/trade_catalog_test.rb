# frozen_string_literal: true

require "test_helper"

class TradeCatalogTest < ActiveSupport::TestCase
  test "maps auto shop aliases to Automobile Technician" do
    [
      "Auto Shop",
      "auto shop",
      "automotive",
      "automobile",
      "auto tech",
      "auto technician",
      "mechanic",
      "diesel",
      "Automobile Technician"
    ].each do |label|
      assert_equal "Automobile Technician", TradeCatalog.normalized_label(label), label
    end
  end

  test "company industry label for auto shops is Auto Shop" do
    assert_equal "Auto Shop", TradeCatalog.company_industry_label("Automobile Technician")
    assert_equal "Auto Shop", TradeCatalog.company_industry_label("auto shop")
    assert_equal "Electrician", TradeCatalog.company_industry_label("Electrician")
    assert_nil TradeCatalog.company_industry_label("General Contracting")
  end

  test "matchable labels include aliases for feed SQL" do
    labels = TradeCatalog.matchable_labels_for(["Automobile Technician"])
    assert_includes labels, "automobile technician"
    assert_includes labels, "auto shop"
    assert_includes labels, "diesel"
    assert_includes labels, "mechanic"
  end
end
