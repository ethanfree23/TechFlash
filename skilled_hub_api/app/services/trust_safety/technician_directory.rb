# frozen_string_literal: true

module TrustSafety
  # "All Technicians" tab: one row per technician with aggregated verification state.
  class TechnicianDirectory
    DEFAULT_PER_PAGE = 25
    MAX_PER_PAGE = 100
    VERIFICATION_FILTERS = %w[all verified unverified needs_review].freeze

    def self.call(params)
      new(params).call
    end

    def initialize(params)
      @params = params
    end

    def call
      scope = User.where(role: User.roles[:technician]).joins(:technician_profile)
      scope = apply_filters(scope)
      total = scope.count
      users = TechnicianIdentity.preload_scope(scope.order(sort_clause)).offset((page - 1) * per_page).limit(per_page).to_a

      user_ids = users.map(&:id)
      profile_ids = users.map { |u| u.technician_profile&.id }.compact

      checks_by_user = {}
      BackgroundCheck.where(user_id: user_ids).order(created_at: :desc, id: :desc).each { |c| checks_by_user[c.user_id] ||= c }
      docs_by_profile = Document.where(uploadable_type: "TechnicianProfile", uploadable_id: profile_ids, doc_type: DocumentPolicy::REVIEWABLE_TYPES).group_by(&:uploadable_id)
      refs_by_user = VerificationReference.where(technician_user_id: user_ids).group_by(&:technician_user_id)

      rows = users.map do |user|
        profile = user.technician_profile
        check = checks_by_user[user.id]
        docs = docs_by_profile[profile&.id] || []
        refs = refs_by_user[user.id] || []
        pending_docs = docs.count(&:pending_review?)
        responded_refs = refs.count(&:responded?)
        bg_needs_review = check ? BackgroundCheckPolicy.needs_review?(check) : false
        {
          technician: TechnicianIdentity.for(user),
          background_check: check ? { key: ItemSerializer.item_key("background_check", check.id), status: BackgroundCheckPolicy.display_status(check), eligible: check.eligible_for_background_gate?, expires_at: check.expires_at&.iso8601 } : nil,
          credentials: {
            total: docs.size,
            approved: docs.count { |d| DocumentPolicy.effective_status(d) == "approved" },
            pending: pending_docs,
            expired: docs.count { |d| DocumentPolicy.effective_status(d) == "expired" }
          },
          references: {
            total: refs.size,
            approved: refs.count(&:approved?),
            responded: responded_refs,
            requested: refs.count(&:requested?)
          },
          pending_review_count: pending_docs + responded_refs + (bg_needs_review ? 1 : 0),
          needs_review: pending_docs.positive? || responded_refs.positive? || bg_needs_review,
          last_activity_at: [check&.updated_at, docs.map(&:updated_at).max, refs.map(&:updated_at).max, profile&.updated_at].compact.max&.iso8601
        }
      end

      {
        technicians: rows,
        pagination: { page: page, per_page: per_page, total: total, total_pages: total.zero? ? 0 : (total.to_f / per_page).ceil },
        filters: { q: @params[:q].presence, verification: verification, trade: @params[:trade].presence, state: @params[:state].presence, sort: sort }
      }
    end

    private

    def apply_filters(scope)
      q = @params[:q].to_s.strip
      if q.present?
        like = "%#{ActiveRecord::Base.sanitize_sql_like(q.downcase)}%"
        scope = scope.where(
          "LOWER(users.email) LIKE :q OR LOWER(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, '')) LIKE :q OR CAST(users.id AS TEXT) = :exact",
          q: like, exact: q
        )
      end
      trade = @params[:trade].to_s.strip
      scope = scope.where("LOWER(COALESCE(technician_profiles.trade_type, '')) LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(trade.downcase)}%") if trade.present?
      state = @params[:state].to_s.strip
      if state.present?
        abbr = UsAddress.state_abbreviation(state).presence || state
        scope = scope.where("LOWER(COALESCE(technician_profiles.state, '')) IN (?)", [state.downcase, abbr.to_s.downcase].uniq)
      end
      case verification
      when "verified" then scope.where(technician_profiles: { background_verified: true })
      when "unverified" then scope.where(technician_profiles: { background_verified: [false, nil] })
      when "needs_review"
        pending_profile_ids = Document.where(uploadable_type: "TechnicianProfile", status: :pending_review, doc_type: DocumentPolicy::REVIEWABLE_TYPES).select(:uploadable_id)
        responded_user_ids = VerificationReference.where(status: :responded).select(:technician_user_id)
        bg_user_ids = BackgroundCheck.where(normalized_status: BackgroundCheckPolicy::NEEDS_REVIEW_PHASES, admin_override_status: :none).select(:user_id)
        scope.where("technician_profiles.id IN (?) OR users.id IN (?) OR users.id IN (?)", pending_profile_ids, responded_user_ids, bg_user_ids)
      else scope
      end
    end

    def verification
      value = @params[:verification].to_s
      VERIFICATION_FILTERS.include?(value) ? value : "all"
    end

    def sort
      %w[name newest oldest].include?(@params[:sort].to_s) ? @params[:sort].to_s : "name"
    end

    def sort_clause
      case sort
      when "newest" then { created_at: :desc }
      when "oldest" then { created_at: :asc }
      else Arel.sql("LOWER(COALESCE(users.last_name, '')) ASC, LOWER(COALESCE(users.first_name, '')) ASC, users.id ASC")
      end
    end

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
