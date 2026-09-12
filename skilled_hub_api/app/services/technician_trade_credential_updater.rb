# frozen_string_literal: true

class TechnicianTradeCredentialUpdater
  class Error < StandardError; end

  SOURCE = "ai_sms"
  TRADE_LICENSE_DOC_TYPES = %w[license certificate cert].freeze
  DEFAULT_DOC_TYPE = "certificate"
  PLACEHOLDER_TITLES = [
    "self-reported via ghl intake",
    "trade license",
    "ghl_self_reported"
  ].freeze
  PLACEHOLDER_NUMBERS = %w[ghl_self_reported].freeze
  MAX_TITLE = 200
  MAX_NUMBER = 80

  def self.set_presence!(profile:, has_credential:)
    raise Error, "technician profile is required" if profile.blank?
    raise Error, "has_credential must be true or false" unless [true, false].include?(has_credential)

    profile.update!(has_trade_credential: has_credential)
    profile
  end

  def self.save_details!(profile:, title: nil, document_number: nil, image: nil, source: SOURCE)
    new(profile: profile, title: title, document_number: document_number, image: image, source: source).save!
  end

  def initialize(profile:, title:, document_number:, image:, source:)
    @profile = profile
    @title = sanitize_title(title)
    @document_number = sanitize_number(document_number)
    @image = image
    @source = source.to_s.presence || SOURCE
  end

  def save!
    raise Error, "technician profile is required" if @profile.blank?
    raise Error, "nothing to save" if @title.blank? && @document_number.blank? && @image.blank?

    @profile.has_trade_credential = true
    @profile.save!
    persist_document!
    @profile
  end

  private

  def persist_document!
    doc = find_or_build_document
    attrs = {}
    attrs[:issuer] = @title if @title.present?
    attrs[:document_number] = @document_number if @document_number.present?
    meta = doc.metadata.to_h.stringify_keys
    meta["source"] ||= @source
    meta["has_trade_credential"] = true
    attrs[:metadata] = meta
    doc.assign_attributes(attrs)
    doc.save!
    attach_image!(doc)
    doc
  end

  def find_or_build_document
    docs = @profile.documents.where(doc_type: TRADE_LICENSE_DOC_TYPES).order(:created_at, :id).to_a
    incomplete = docs.find { |doc| incomplete_doc?(doc) }
    return incomplete if incomplete
    return docs.last if docs.any?

    @profile.documents.build(
      doc_type: DEFAULT_DOC_TYPE,
      status: :pending_review,
      issuer: @title.presence || "Trade license",
      document_number: @document_number,
      metadata: { "source" => @source, "has_trade_credential" => true }
    )
  end

  def incomplete_doc?(doc)
    title = real_title(doc.issuer)
    has_file = doc.file.attached? && doc.file.blob.present?
    title.blank? || !has_file
  end

  def attach_image!(doc)
    return if @image.blank?
    return if doc.file.attached?

    GhlDocumentFileAttacher.attach!(doc, @image)
  rescue GhlDocumentFileAttacher::Error => e
    raise Error, e.message
  end

  def sanitize_title(value)
    raw = value.to_s.strip
    return nil if raw.blank? || PLACEHOLDER_TITLES.include?(raw.downcase)

    raw.truncate(MAX_TITLE)
  end

  def sanitize_number(value)
    raw = value.to_s.strip
    return nil if raw.blank? || PLACEHOLDER_NUMBERS.include?(raw.downcase)

    raw.truncate(MAX_NUMBER)
  end

  def real_title(value)
    raw = value.to_s.strip
    return nil if raw.blank? || PLACEHOLDER_TITLES.include?(raw.downcase)

    raw
  end
end
