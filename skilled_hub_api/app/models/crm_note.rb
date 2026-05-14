# frozen_string_literal: true

class CrmNote < ApplicationRecord
  CONTACT_METHODS = %w[call text email in_person note].freeze

  belongs_to :crm_lead
  belongs_to :parent_note, class_name: "CrmNote", optional: true
  has_many :comments, class_name: "CrmNote", foreign_key: :parent_note_id, dependent: :nullify

  validates :body, presence: true, unless: -> { remind_at.present? }
  validates :contact_method, inclusion: { in: CONTACT_METHODS }
  validate :parent_note_must_belong_to_same_lead

  private

  def parent_note_must_belong_to_same_lead
    return if parent_note_id.blank?
    return if parent_note&.crm_lead_id == crm_lead_id

    errors.add(:parent_note_id, "must belong to the same CRM lead")
  end
end
