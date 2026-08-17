# frozen_string_literal: true

require "test_helper"

class TechnicianClassCatalogTest < ActiveSupport::TestCase
  test "canonical slugs are apprentice journeyman master" do
    assert_equal %w[apprentice journeyman master], TechnicianClassCatalog::SLUGS
  end

  test "normalizes labels and slugs to canonical slugs" do
    assert_equal "apprentice", TechnicianClassCatalog.normalized_slug(" apprentice ")
    assert_equal "journeyman", TechnicianClassCatalog.normalized_label("JOURNEYMAN")
    assert_equal "master", TechnicianClassCatalog.normalized_slug("Master")
    assert_equal "journeyman", TechnicianClassCatalog.normalized_slug("journeyman")
  end

  test "label_for returns display labels" do
    assert_equal "Journeyman", TechnicianClassCatalog.label_for("journeyman")
    assert_equal "Apprentice", TechnicianClassCatalog.label_for("APPRENTICE")
    assert_equal "HVAC", TechnicianClassCatalog.label_for("HVAC")
  end

  test "rejects trade-like and blank values" do
    assert_nil TechnicianClassCatalog.normalized_label("HVAC")
    assert_nil TechnicianClassCatalog.normalized_label("Residential")
    assert_nil TechnicianClassCatalog.normalized_label("")
    refute TechnicianClassCatalog.valid_label?("Electrician")
  end
end
