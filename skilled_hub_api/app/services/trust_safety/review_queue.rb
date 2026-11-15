# frozen_string_literal: true

module TrustSafety
  # Unified, technician-centric review queue across background checks, documents and
  # references. Filtering happens in SQL per source; merging, priority sorting and
  # pagination happen in Ruby over a bounded candidate set.
  class ReviewQueue
    REVIEW_TYPES = %w[all background_check credential reference].freeze
    STATUSES = %w[needs_review pending approved rejected expired flagged all].freeze
    SORTS = %w[priority newest oldest].freeze
    DEFAULT_PER_PAGE = 25
    MAX_PER_PAGE = 100
    PER_SOURCE_CAP = 2_000

    PRIORITY_RANK = { "high" => 0, "medium" => 1, "normal" => 2 }.freeze

    attr_reader :params

    def self.call(params)
      new(params).call
    end

    def initialize(params)
      @params = params
    end

    def call
      sources = []
      sources << background_check_items if include_type?("background_check")
      sources << document_items if include_type?("credential")
      sources << reference_items if include_type?("reference")

      truncated_sources = sources.select { |source| source[:capped] }.map { |source| source[:name] }
      items = sources.flat_map { |source| source[:items] }

      sorted = sort_items(items)
      total = sorted.size
      page_items = sorted.slice(offset, per_page) || []

      {
        items: page_items,
        pagination: {
          page: page,
          per_page: per_page,
          total: total,
          total_pages: total.zero? ? 0 : (total.to_f / per_page).ceil
        },
        filters: {
          q: query.presence,
          review_type: review_type,
          status: status,
          trade: trade.presence,
          state: state.presence,
          technician_user_id: technician_user_id,
          sort: sort
        },
        # True when any source hit PER_SOURCE_CAP before merge. Metrics use SQL counts
        # (Summary) and remain accurate; this flag only means the merged list may omit
        # older rows beyond the per-source candidate window.
        truncated: truncated_sources.any?,
        truncated_sources: truncated_sources,
        per_source_cap: PER_SOURCE_CAP
      }
    end

    private

    # --- Params --------------------------------------------------------------------

    def query
      params[:q].to_s.strip
    end

    def review_type
      value = params[:review_type].to_s
      REVIEW_TYPES.include?(value) ? value : "all"
    end

    def status
      value = params[:status].to_s
      STATUSES.include?(value) ? value : "needs_review"
    end

    def sort
      value = params[:sort].to_s
      SORTS.include?(value) ? value : "priority"
    end

    def trade
      params[:trade].to_s.strip
    end

    def state
      params[:state].to_s.strip
    end

    def technician_user_id
      params[:technician_user_id].presence&.to_i
    end

    def page
      [params[:page].to_i, 1].max
    end

    def per_page
      value = params[:per_page].to_i
      value = DEFAULT_PER_PAGE if value <= 0
      [value, MAX_PER_PAGE].min
    end

    def offset
      (page - 1) * per_page
    end

    def include_type?(type)
      review_type == "all" || review_type == type
    end

    # --- Shared technician filters (all sources join technician_profiles + users) -----

    def apply_technician_filters(scope)
      if query.present?
        like = "%#{ActiveRecord::Base.sanitize_sql_like(query.downcase)}%"
        scope = scope.where(
          "LOWER(users.email) LIKE :q OR LOWER(COALESCE(users.first_name, '')) LIKE :q OR LOWER(COALESCE(users.last_name, '')) LIKE :q " \
          "OR LOWER(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) LIKE :q",
          q: like
        )
      end
      if trade.present?
        scope = scope.where("LOWER(COALESCE(technician_profiles.trade_type, '')) LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(trade.downcase)}%")
      end
      if state.present?
        abbr = UsAddress.state_abbreviation(state).presence || state
        scope = scope.where("LOWER(COALESCE(technician_profiles.state, '')) IN (?)", [state.downcase, abbr.to_s.downcase].uniq)
      end
      scope = scope.where(users: { id: technician_user_id }) if technician_user_id
      scope
    end

    def identities_for(users)
      users.each_with_object({}) { |user, hash| hash[user.id] = TechnicianIdentity.for(user) }
    end

    def load_users(ids)
      return {} if ids.empty?

      users = TechnicianIdentity.preload_scope(User.where(id: ids.uniq))
      identities_for(users)
    end

    # --- Background checks -----------------------------------------------------------------

    def background_check_items
      scope = BackgroundCheck
        .joins(:user)
        .joins("INNER JOIN technician_profiles ON technician_profiles.user_id = users.id")
        .where(users: { role: User.roles[:technician] })
      scope = apply_technician_filters(scope)
      scope = apply_background_status_filter(scope)
      # Prefer oldest pending work so a large backlog cannot hide unreviewed reports.
      order = status.in?(%w[needs_review pending flagged]) ? { created_at: :asc, id: :asc } : { updated_at: :desc, id: :desc }
      checks = scope.order(order).limit(PER_SOURCE_CAP).to_a
      capped = checks.size >= PER_SOURCE_CAP
      identities = load_users(checks.map(&:user_id))
      items = checks.filter_map do |check|
        item = ItemSerializer.background_check(check, identity: identities[check.user_id])
        next unless matches_in_memory_status?(item, source: :background_check, record: check)

        item
      end
      { name: "background_check", items: items, capped: capped }
    end

    def apply_background_status_filter(scope)
      case status
      when "needs_review"
        scope.where(normalized_status: BackgroundCheckPolicy::NEEDS_REVIEW_PHASES)
             .or(scope.where(normalized_status: [nil, ""], status: BackgroundCheckPolicy::LEGACY_NEEDS_REVIEW))
             .or(scope.where(status: :failed))
             .where(admin_override_status: :none)
      when "flagged"
        scope.where(normalized_status: BackgroundCheckPolicy::NEEDS_REVIEW_PHASES + BackgroundCheckPolicy::SUSPENDED_PHASES)
             .or(scope.where(normalized_status: [nil, ""], status: BackgroundCheckPolicy::LEGACY_FLAGGED))
             .or(scope.where(status: :failed))
      when "pending"
        scope.where(normalized_status: BackgroundCheckPolicy::IN_PROGRESS_PHASES + BackgroundCheckPolicy::SUSPENDED_PHASES)
             .or(scope.where(normalized_status: [nil, ""], status: BackgroundCheckPolicy::LEGACY_IN_PROGRESS))
      when "approved"
        scope.where(status: %i[clear manually_approved])
      when "rejected"
        scope.where(status: :manually_rejected).or(scope.where(normalized_status: BackgroundCheckPolicy::ADVERSE_PHASES))
      when "expired"
        scope.where(status: :expired).or(scope.where(normalized_status: "invitation_expired"))
             .or(scope.where("background_checks.expires_at IS NOT NULL AND background_checks.expires_at < ?", Time.current))
      else
        scope
      end
    end

    # --- Documents -------------------------------------------------------------------------------

    def document_items
      scope = Document
        .where(uploadable_type: "TechnicianProfile", doc_type: DocumentPolicy::REVIEWABLE_TYPES)
        .joins("INNER JOIN technician_profiles ON technician_profiles.id = documents.uploadable_id")
        .joins("INNER JOIN users ON users.id = technician_profiles.user_id")
        .includes(:reviewed_by_user, file_attachment: :blob)
      scope = apply_technician_filters(scope)
      scope = apply_document_status_filter(scope)
      docs = scope.order(created_at: :asc, id: :asc).limit(PER_SOURCE_CAP).to_a
      capped = docs.size >= PER_SOURCE_CAP
      profile_user_ids = TechnicianProfile.where(id: docs.map(&:uploadable_id).uniq).pluck(:id, :user_id).to_h
      identities = load_users(profile_user_ids.values)
      items = docs.filter_map do |doc|
        identity = identities[profile_user_ids[doc.uploadable_id]]
        item = ItemSerializer.document(doc, identity: identity)
        next unless matches_in_memory_status?(item, source: :document, record: doc)

        item
      end
      { name: "credential", items: items, capped: capped }
    end

    def apply_document_status_filter(scope)
      case status
      when "needs_review", "pending" then scope.where(status: :pending_review)
      when "approved" then scope.where(status: :approved)
      when "rejected" then scope.where(status: :rejected)
      when "expired" then scope.where(status: :approved).where("documents.valid_until IS NOT NULL AND documents.valid_until < ?", Date.current)
      when "flagged" then scope.none
      else scope
      end
    end

    # --- References --------------------------------------------------------------------------------

    def reference_items
      scope = VerificationReference
        .joins("INNER JOIN users ON users.id = verification_references.technician_user_id")
        .joins("INNER JOIN technician_profiles ON technician_profiles.user_id = users.id")
        .includes(:reviewed_by_user)
      scope = apply_technician_filters(scope)
      scope = apply_reference_status_filter(scope)
      refs = scope.order(created_at: :asc, id: :asc).limit(PER_SOURCE_CAP).to_a
      capped = refs.size >= PER_SOURCE_CAP
      identities = load_users(refs.map(&:technician_user_id))
      items = refs.map { |ref| ItemSerializer.reference(ref, identity: identities[ref.technician_user_id]) }
      { name: "reference", items: items, capped: capped }
    end

    def apply_reference_status_filter(scope)
      case status
      when "needs_review" then scope.where(status: :responded)
      when "pending" then scope.where(status: %i[requested responded])
      when "approved" then scope.where(status: :approved)
      when "rejected" then scope.where(status: :rejected)
      when "expired", "flagged" then scope.none
      else scope
      end
    end

    # SQL narrows candidates; this guards edge cases SQL cannot express exactly
    # (e.g. approved documents that are expired should not appear under "approved").
    def matches_in_memory_status?(item, source:, record:)
      case status
      when "approved"
        return item[:status][:key] != "expired" if source == :document
        return record.eligible_for_background_gate? if source == :background_check
      when "needs_review"
        return item[:needs_review] if source == :background_check
      end
      true
    end

    # --- Sorting -----------------------------------------------------------------------------------

    def sort_items(items)
      case sort
      when "newest"
        items.sort_by { |item| [-(timestamp(item[:submitted_at])), item[:key]] }
      when "oldest"
        items.sort_by { |item| [timestamp(item[:submitted_at]), item[:key]] }
      else
        items.sort_by do |item|
          [
            PRIORITY_RANK.fetch(item.dig(:priority, :level), 3),
            item[:needs_review] ? 0 : 1,
            timestamp(item[:submitted_at]),
            item[:key]
          ]
        end
      end
    end

    def timestamp(iso)
      return 0 if iso.blank?

      Time.iso8601(iso).to_i
    rescue ArgumentError
      0
    end
  end
end
