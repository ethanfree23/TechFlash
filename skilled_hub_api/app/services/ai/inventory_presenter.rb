# frozen_string_literal: true

module Ai
  class InventoryPresenter
    def self.sanitize(inventory)
      new(inventory).sanitize
    end

    def initialize(inventory)
      @inventory = inventory.is_a?(Hash) ? inventory.deep_stringify_keys : {}
    end

    def sanitize
      trade = @inventory["trade_license"] || {}
      refs = @inventory["professional_references"] || {}
      background = @inventory["background_check"] || {}
      {
        trade_license: {
          state: trade["state"],
          complete: trade["complete"],
          missing: Array(trade["missing"]),
          documents: Array(trade["documents"]).map { |doc| document_slice(doc) }
        },
        professional_references: {
          count: refs["count"].to_i,
          missing_count: refs["missing_count"].to_i,
          complete: refs["complete"],
          references: Array(refs["references"]).map { |ref| reference_slice(ref) }
        },
        background_check: {
          state: background["state"],
          label: background["label"],
          color_bucket: background["color_bucket"],
          complete: background["complete"],
          technician_actionable: background["technician_actionable"],
          technician_action: background["technician_action"]
        },
        actionable_missing: Array(@inventory["actionable_missing"]),
        technician_actionable: @inventory["technician_actionable"] == true,
        collection_complete: @inventory["collection_complete"] == true,
        needs_human: @inventory["needs_human"] == true
      }
    end

    private

    def document_slice(doc)
      data = doc.to_h.stringify_keys
      {
        id: data["id"],
        title: data["issuer"],
        has_file: data["has_file"] == true,
        missing: Array(data["missing"])
      }
    end

    def reference_slice(ref)
      data = ref.to_h.stringify_keys
      {
        full_name: data["full_name"],
        company_name: data["company_name"],
        has_phone: data["phone"].present?,
        has_email: data["email"].present?
      }
    end
  end
end
