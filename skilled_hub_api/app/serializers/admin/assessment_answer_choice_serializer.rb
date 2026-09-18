# frozen_string_literal: true

module Admin
  # The only serializer in the application that exposes `correct`.
  #
  # Reachable exclusively from Api::V1::Admin controllers, all of which run
  # `before_action :require_admin`. Keeping the answer key confined to one
  # explicitly-named admin serializer makes "can a technician see the key?" a
  # question with a one-file answer.
  class AssessmentAnswerChoiceSerializer < ActiveModel::Serializer
    attributes :id, :body, :correct, :position, :external_key
  end
end
