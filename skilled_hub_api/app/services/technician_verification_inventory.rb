# frozen_string_literal: true

class TechnicianVerificationInventory
  include ActiveStorageUrlHelper

  TRADE_LICENSE_DOC_TYPES = %w[license certificate cert].freeze
  PLACEHOLDER_TITLES = [
    "self-reported via ghl intake",
    "trade license",
    "ghl_self_reported"
  ].freeze
  PLACEHOLDER_NUMBERS = %w[ghl_self_reported].freeze
  COMPLETE_REFERENCE_COUNT = 3

  def self.call(user, documents: nil, references: nil, background_check: nil, preloaded: false)
    new(
      user,
      documents: documents,
      references: references,
      background_check: background_check,
      preloaded: preloaded
    ).to_h
  end

  def self.preload_for(users)
    users = Array(users)
    profile_ids = users.map { |user| user.technician_profile&.id }.compact
    user_ids = users.map(&:id)

    documents = Document.where(
      uploadable_type: "TechnicianProfile",
      uploadable_id: profile_ids,
      doc_type: TRADE_LICENSE_DOC_TYPES
    ).with_attached_file.order(:created_at, :id)
    documents_by_profile = documents.group_by(&:uploadable_id)

    references = VerificationReference.where(technician_user_id: user_ids).order(:created_at, :id)
    references_by_user = references.group_by(&:technician_user_id)

    checks = BackgroundCheck.where(user_id: user_ids).order(created_at: :desc, id: :desc)
    check_by_user = {}
    checks.each { |check| check_by_user[check.user_id] ||= check }

    users.each_with_object({}) do |user, hash|
      hash[user.id] = call(
        user,
        documents: documents_by_profile[user.technician_profile&.id] || [],
        references: references_by_user[user.id] || [],
        background_check: check_by_user[user.id],
        preloaded: true
      )
    end
  end

  def initialize(user, documents: nil, references: nil, background_check: nil, preloaded: false)
    @user = user
    @profile = user&.technician_profile
    @documents = documents
    @references = references
    @background_check = background_check
    @preloaded = preloaded
  end

  def to_h
    return nil unless @user&.technician? && @profile

    trade = trade_license_payload
    refs = references_payload
    background = background_check_payload
    missing = compile_missing(trade, refs, background)

    actionable = compile_actionable_missing(trade, refs, background)

    {
      trade_license: trade,
      professional_references: refs,
      background_check: background,
      missing: missing,
      actionable_missing: actionable,
      technician_actionable: actionable.any?,
      collection_complete: actionable.empty? && background[:color_bucket] != "review",
      needs_human: background[:color_bucket] == "review",
      pending: pending?(trade, refs, background),
      suggested_sms: suggested_sms(trade, refs, background)
    }
  end

  private

  def license_documents
    return Array(@documents) if @preloaded

    @license_documents ||= Document.where(
      uploadable: @profile,
      doc_type: TRADE_LICENSE_DOC_TYPES
    ).with_attached_file.order(:created_at, :id).to_a
  end

  def reference_records
    return Array(@references) if @preloaded

    @reference_records ||= @user.verification_references_as_technician.order(:created_at, :id).to_a
  end

  def latest_background_check
    return @background_check if @preloaded

    @loaded_background_check ||= @user.background_checks.order(created_at: :desc, id: :desc).first
  end

  def trade_license_payload
    docs = license_documents.map { |doc| document_payload(doc) }
    claimed = @profile.has_trade_credential == true || docs.any?
    complete = docs.any? { |doc| doc[:complete] }

    state =
      if complete
        "yes"
      elsif claimed
        "no"
      elsif @profile.has_trade_credential == false
        "na"
      else
        "unknown"
      end

    missing = []
    if state == "unknown"
      missing << "whether they hold a trade credential"
    elsif state == "no"
      missing.concat(docs.flat_map { |doc| doc[:missing] }.uniq)
      missing << "credential documentation" if missing.empty?
    end

    {
      state: state,
      complete: complete,
      documents: docs,
      missing: missing
    }
  end

  def document_payload(doc)
    title = real_title(doc.issuer)
    number = real_number(doc.document_number)
    has_file = blob_file_present?(doc.file)
    missing = []
    missing << "document title" if title.blank?
    missing << "license photo" if !has_file
    {
      id: doc.id,
      doc_type: doc.doc_type,
      issuer: title,
      document_number: number,
      has_file: has_file,
      file_url: has_file ? absolute_blob_url(doc.file) : nil,
      status: doc.status,
      created_at: doc.created_at&.iso8601,
      complete: title.present? && has_file,
      missing: missing
    }
  end

  def real_title(value)
    raw = value.to_s.strip
    return nil if raw.blank? || PLACEHOLDER_TITLES.include?(raw.downcase)

    raw
  end

  def real_number(value)
    raw = value.to_s.strip
    return nil if raw.blank? || PLACEHOLDER_NUMBERS.include?(raw.downcase)

    raw
  end

  def references_payload
    records = reference_records
    count = records.size
    {
      count: count,
      complete: count >= COMPLETE_REFERENCE_COUNT,
      display_count: count > COMPLETE_REFERENCE_COUNT ? "3+" : count.to_s,
      references: records.map { |ref| reference_payload(ref) },
      missing_count: [COMPLETE_REFERENCE_COUNT - count, 0].max
    }
  end

  def reference_payload(ref)
    {
      id: ref.id,
      full_name: ref.full_name,
      company_name: ref.company_name.presence,
      phone: ref.phone.presence,
      email: ref.email.presence,
      relationship: ref.relationship.presence,
      status: ref.status
    }.compact
  end

  def background_check_payload
    check = latest_background_check
    unless check
      return {
        state: "not_started",
        label: "Incomplete",
        color_bucket: "incomplete",
        complete: false,
        technician_actionable: true,
        technician_action: "start",
        details: {}
      }
    end

    mapping = background_mapping(check)
    action = background_technician_action(mapping)
    {
      state: mapping[:state],
      label: mapping[:label],
      color_bucket: mapping[:color_bucket],
      complete: mapping[:complete],
      technician_actionable: %i[start complete_invitation].include?(action),
      technician_action: action.to_s,
      details: {
        package_name: check.package_name.presence,
        started_at: check.started_at&.iso8601,
        completed_at: check.completed_at&.iso8601,
        admin_override_status: check.admin_override_status.presence,
        provider_status: check.provider_status.presence,
        normalized_status: check.normalized_status_value,
        invitation_url: action == :complete_invitation ? check.invitation_url.presence : nil
      }.compact
    }
  end

  def background_mapping(check)
    state = check.normalized_status_value.to_s.presence || "not_started"
    override = check.admin_override_status.to_s
    state = "clear" if override == "manually_approved" && state != "clear"
    state = "consider" if override == "manually_rejected" && !%w[consider review_required].include?(state)

    case state
    when "not_started"
      { state: state, label: "Incomplete", color_bucket: "incomplete", complete: false }
    when "invitation_sent"
      { state: state, label: "Invitation sent", color_bucket: "processing", complete: false }
    when "invitation_completed", "pending", "report_pending", "processing", "report_engaged"
      { state: state, label: "In progress", color_bucket: "processing", complete: false }
    when "report_suspended"
      { state: state, label: "Action required", color_bucket: "processing", complete: false }
    when "report_resumed"
      { state: state, label: "Resumed", color_bucket: "processing", complete: false }
    when "clear"
      { state: state, label: "Clear", color_bucket: "passed", complete: true }
    when "consider", "review_required"
      { state: state, label: "Consider", color_bucket: "review", complete: false }
    when "report_disputed"
      { state: state, label: "Disputed", color_bucket: "review", complete: false }
    when "report_pre_adverse_action"
      { state: state, label: "Pre-adverse", color_bucket: "review", complete: false }
    when "report_post_adverse_action", "adverse_action_notice_not_delivered"
      { state: state, label: "Post-adverse", color_bucket: "review", complete: false }
    when "report_complete", "complete_with_canceled_screenings"
      { state: state, label: check.admin_visible_status_label, color_bucket: "review", complete: false }
    when "canceled", "report_canceled", "invitation_expired", "invitation_deleted"
      { state: state, label: "Canceled", color_bucket: "canceled", complete: false }
    when "failed"
      { state: state, label: "Failed", color_bucket: "failed", complete: false }
    when "expired"
      { state: state, label: "Expired", color_bucket: "failed", complete: false }
    else
      { state: state, label: check.admin_visible_status_label, color_bucket: "processing", complete: false }
    end
  end

  def compile_missing(trade, refs, background)
    items = []
    if trade[:state] == "unknown"
      items << { key: "trade_license_status", label: "whether they hold a trade credential" }
    elsif trade[:state] == "no"
      trade[:missing].each do |piece|
        items << { key: "trade_license", label: piece }
      end
    end
    if refs[:missing_count].positive?
      noun = refs[:missing_count] == 1 ? "professional reference" : "professional references"
      items << { key: "professional_references", label: "#{refs[:missing_count]} #{noun}", count: refs[:missing_count] }
    end
    unless background[:complete] || background[:color_bucket] == "review"
      items << { key: "background_check", label: "background-check completion" }
    end
    if background[:color_bucket] == "review"
      items << { key: "background_check_review", label: "background-check review" }
    end
    items
  end

  def compile_actionable_missing(trade, refs, background)
    items = []
    if trade[:state] == "unknown"
      items << { key: "trade_license_status", label: "whether they hold a trade credential" }
    elsif trade[:state] == "no"
      trade[:missing].each do |piece|
        items << { key: "trade_license", label: piece }
      end
    end
    if refs[:missing_count].positive?
      noun = refs[:missing_count] == 1 ? "professional reference" : "professional references"
      items << { key: "professional_references", label: "#{refs[:missing_count]} #{noun}", count: refs[:missing_count] }
    end
    if background[:technician_actionable]
      items << { key: "background_check", label: "background-check completion" }
    end
    items
  end

  def background_technician_action(mapping)
    return :none if mapping[:complete]
    return :human_review if mapping[:color_bucket] == "review"

    case mapping[:state]
    when "invitation_sent", "report_suspended"
      :complete_invitation
    when "invitation_completed", "pending", "report_pending", "processing", "report_engaged", "report_resumed"
      :wait
    else
      :start
    end
  end

  def pending?(trade, refs, background)
    return true if trade[:state] == "no" || trade[:state] == "unknown"
    return true if refs[:missing_count].positive?
    return true unless background[:complete]

    false
  end

  def suggested_sms(trade, refs, background)
    name = @user.first_name.to_s.strip.presence || "there"
    {
      trade_license: trade_license_sms(name, trade),
      professional_references: references_sms(name, refs),
      background_check: background_sms(name, background),
      next_gap: next_gap_sms(name, trade, refs, background)
    }
  end

  def trade_license_sms(name, trade)
    return nil if trade[:state] == "yes" || trade[:state] == "na"

    "Hey #{name}, this is TechFlash. We still need your trade license or certification information. Please send the credential photo, title, and license/reference number if it has one."
  end

  def references_sms(name, refs)
    return nil if refs[:complete]

    needed = refs[:missing_count]
    noun = needed == 1 ? "professional reference" : "professional references"
    "Hey #{name}, this is TechFlash. We still need #{needed} #{noun} to complete your profile. Please send each person's name, company, phone, and email."
  end

  def background_sms(name, background)
    return nil if background[:complete]

    "Hey #{name}, this is TechFlash. Your background check still needs to be completed before your technician profile is fully verified."
  end

  def next_gap_sms(name, trade, refs, background)
    trade_license_sms(name, trade) ||
      references_sms(name, refs) ||
      background_sms(name, background)
  end
end
