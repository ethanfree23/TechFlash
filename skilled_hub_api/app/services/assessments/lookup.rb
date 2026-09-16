# frozen_string_literal: true

module Assessments
  # Resolves an assessment from a URL segment.
  #
  # Clients get slugs from the catalog and ids from stored attempts, so every
  # endpoint that takes an :assessment_id accepts either. Slugs are never purely
  # numeric (the format validation on Assessment requires a leading letter), so
  # "is it a number" is an unambiguous test for which one was sent.
  module Lookup
    def self.find(slug_or_id)
      scope(Assessment.all, slug_or_id)
    end

    def self.active(slug_or_id)
      scope(Assessment.active, slug_or_id)
    end

    def self.scope(relation, slug_or_id)
      key = slug_or_id.to_s.strip
      return nil if key.empty?

      if key.match?(/\A\d+\z/)
        relation.find_by(id: key.to_i)
      else
        relation.find_by(slug: key)
      end
    end
    private_class_method :scope
  end
end
