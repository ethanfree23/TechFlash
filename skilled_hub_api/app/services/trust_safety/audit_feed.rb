# frozen_string_literal: true

module TrustSafety
  # Read-only view over VerificationAuditLog with human-readable actor/subject names.
  # Existing audit rows are never modified.
  class AuditFeed
    DEFAULT_PER_PAGE = 50
    MAX_PER_PAGE = 200

    ACTION_LABELS = {
      "background_check_override" => "Background check manual override",
      "document_approved" => "Document approved",
      "document_rejected" => "Document rejected",
      "document_rereviewed" => "Document decision overridden",
      "document_info_requested" => "More information requested (document)",
      "reference_approved" => "Reference marked verified",
      "reference_rejected" => "Reference rejected",
      "reference_rereviewed" => "Reference decision overridden",
      "reference_info_requested" => "More information requested (reference)",
      "reference_contact_attempt" => "Reference contact attempt recorded",
      "reviewer_note" => "Reviewer note"
    }.freeze

    ENTITY_ITEM_TYPES = {
      "BackgroundCheck" => "background_check",
      "Document" => "document",
      "VerificationReference" => "reference"
    }.freeze

    def self.call(params)
      new(params).call
    end

    def initialize(params)
      @params = params
    end

    def call
      scope = VerificationAuditLog.includes(:actor_user, user: { technician_profile: { avatar_attachment: :blob } }).order(created_at: :desc, id: :desc)
      scope = scope.where(user_id: @params[:technician_user_id]) if @params[:technician_user_id].present?
      if @params[:item_type].present? && @params[:item_id].present?
        entity_type = ENTITY_ITEM_TYPES.key(@params[:item_type].to_s)
        scope = scope.where(entity_type: entity_type, entity_id: @params[:item_id]) if entity_type
      end
      scope = scope.where(action: @params[:event_action]) if @params[:event_action].present?
      if @params[:q].present?
        like = "%#{ActiveRecord::Base.sanitize_sql_like(@params[:q].to_s.downcase)}%"
        scope = scope.joins(:user).where(
          "LOWER(users.email) LIKE :q OR LOWER(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) LIKE :q", q: like
        )
      end

      total = scope.count
      rows = scope.offset((page - 1) * per_page).limit(per_page).to_a

      {
        events: rows.map { |row| serialize(row) },
        pagination: { page: page, per_page: per_page, total: total, total_pages: total.zero? ? 0 : (total.to_f / per_page).ceil }
      }
    end

    def self.serialize(row)
      new({}).serialize(row)
    end

    def serialize(row)
      {
        id: row.id,
        action: row.action,
        action_label: ACTION_LABELS[row.action] || row.action.to_s.humanize,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        item_type: ENTITY_ITEM_TYPES[row.entity_type],
        item_key: ENTITY_ITEM_TYPES[row.entity_type] ? ItemSerializer.item_key(ENTITY_ITEM_TYPES[row.entity_type], row.entity_id) : nil,
        actor: ItemSerializer.user_summary(row.actor_user),
        technician: row.user && TechnicianIdentity.for(row.user),
        details: row.details.is_a?(Hash) ? row.details : {},
        created_at: row.created_at&.iso8601
      }
    end

    private

    def page
      [@params[:page].to_i, 1].max
    end

    def per_page
      value = @params[:per_page].to_i
      value = DEFAULT_PER_PAGE if value <= 0
      [value, MAX_PER_PAGE].min
    end
  end
end
