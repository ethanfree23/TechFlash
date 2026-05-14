# frozen_string_literal: true

module Api
  module V1
    module Admin
      class CrmNotesController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_lead
        before_action :set_note, only: %i[update]

        def create
          note = @lead.crm_notes.new(note_params)
          if note.save
            render json: { crm_note: crm_note_json(note), crm_notes: crm_notes_payload(@lead) }, status: :created
          else
            render json: { errors: note.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          if @note.update(note_params.except(:parent_note_id))
            render json: { crm_note: crm_note_json(@note), crm_notes: crm_notes_payload(@lead) }, status: :ok
          else
            render json: { errors: @note.errors.full_messages }, status: :unprocessable_entity
          end
        end

        private

        def set_lead
          @lead = CrmLead.find(params[:crm_lead_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "CRM record not found" }, status: :not_found
        end

        def set_note
          @note = @lead.crm_notes.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "CRM note not found" }, status: :not_found
        end

        def note_params
          params.permit(:contact_method, :title, :body, :made_contact, :parent_note_id, :remind_at)
        end

        def crm_notes_payload(lead)
          roots = lead.crm_notes.where(parent_note_id: nil).order(created_at: :asc)
          roots.map { |n| crm_note_json(n, include_comments: true) }
        end

        def crm_note_json(note, include_comments: false)
          payload = {
            id: note.id,
            crm_lead_id: note.crm_lead_id,
            parent_note_id: note.parent_note_id,
            contact_method: note.contact_method,
            title: note.title,
            body: note.body,
            made_contact: note.made_contact,
            remind_at: note.remind_at&.iso8601,
            created_at: note.created_at,
            updated_at: note.updated_at
          }
          if include_comments
            payload[:comments] = note.comments.order(created_at: :asc).map { |comment| crm_note_json(comment, include_comments: false) }
          end
          payload
        end
      end
    end
  end
end
