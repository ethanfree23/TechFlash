# frozen_string_literal: true

# Blocks writes to assessment content (categories, questions, answer choices)
# once its owning AssessmentVersion has been published.
#
# This is the mechanism that keeps historical scores honest: an attempt recorded
# against version 1 can always be replayed against the exact content it was
# scored on. Admins change published content by cloning a new draft version.
module AssessmentContentImmutability
  extend ActiveSupport::Concern

  IMMUTABLE_MESSAGE = "belongs to a published assessment version and cannot be changed. " \
                      "Create a new assessment version instead."

  BYPASS_KEY = :assessment_content_immutability_bypass

  class << self
    def bypassing?
      Thread.current[BYPASS_KEY] == true
    end

    # Cascading deletes of a whole version/assessment legitimately remove frozen
    # content, so those paths opt out explicitly rather than weakening the guard.
    def bypass
      previous = Thread.current[BYPASS_KEY]
      Thread.current[BYPASS_KEY] = true
      yield
    ensure
      Thread.current[BYPASS_KEY] = previous
    end
  end

  included do
    validate :owning_version_must_accept_content_changes
    before_destroy :block_destroy_on_frozen_version
  end

  # Implemented by including models.
  def owning_assessment_version
    raise NotImplementedError, "#{self.class.name} must define #owning_assessment_version"
  end

  private

  def content_guard_active?
    return false if AssessmentContentImmutability.bypassing?

    version = owning_assessment_version
    version.present? && version.frozen_content?
  end

  def owning_version_must_accept_content_changes
    return if persisted? && !changed?
    return unless content_guard_active?

    errors.add(:base, "#{self.class.name.titleize} #{IMMUTABLE_MESSAGE}")
  end

  def block_destroy_on_frozen_version
    return unless content_guard_active?

    errors.add(:base, "#{self.class.name.titleize} #{IMMUTABLE_MESSAGE}")
    throw(:abort)
  end
end
