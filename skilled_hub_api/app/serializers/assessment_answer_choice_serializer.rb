# frozen_string_literal: true

# Answer-key-free view of an answer choice.
#
# This is deliberately the default serializer for AssessmentAnswerChoice so that
# any incidental or future serialization of a choice cannot leak `correct`.
# Admin::AssessmentAnswerChoiceSerializer is the single explicit opt-in that
# exposes the key.
class AssessmentAnswerChoiceSerializer < ActiveModel::Serializer
  attributes :id, :body, :position
end
