# frozen_string_literal: true

class CanonicalizeSkillClassSlugs < ActiveRecord::Migration[7.1]
  CANONICAL = %w[apprentice journeyman master].freeze

  def up
    CANONICAL.each do |slug|
      quoted = connection.quote(slug)
      execute(<<~SQL.squish)
        UPDATE jobs SET skill_class = #{quoted}
        WHERE LOWER(skill_class) = #{quoted}
      SQL
      execute(<<~SQL.squish)
        UPDATE technician_profiles SET skill_class = #{quoted}
        WHERE LOWER(skill_class) = #{quoted}
      SQL
    end
  end

  def down
    {
      "apprentice" => "Apprentice",
      "journeyman" => "Journeyman",
      "master" => "Master"
    }.each do |slug, label|
      execute(<<~SQL.squish)
        UPDATE jobs SET skill_class = #{connection.quote(label)}
        WHERE skill_class = #{connection.quote(slug)}
      SQL
      execute(<<~SQL.squish)
        UPDATE technician_profiles SET skill_class = #{connection.quote(label)}
        WHERE skill_class = #{connection.quote(slug)}
      SQL
    end
  end
end
