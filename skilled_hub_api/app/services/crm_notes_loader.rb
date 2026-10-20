# frozen_string_literal: true

# Applies spreadsheet rows (company URL + sales note + optional new contacts) to CRM leads.
# Each row is matched to an existing CrmLead by website domain (falling back to company name),
# then a timeline CrmNote is appended and any contacts not already on the record are merged in.
class CrmNotesLoader
  ROW_FIELDS = %w[
    website company_name note title contact_method made_contact remind_at note_date status
    contact_name contact_email contact_phone contact_title contacts
  ].freeze

  CONTACT_METHOD_ALIASES = {
    "call" => "call", "called" => "call", "phone" => "call", "phone call" => "call", "voicemail" => "call", "vm" => "call",
    "text" => "text", "sms" => "text", "texted" => "text", "message" => "text",
    "email" => "email", "emailed" => "email", "e-mail" => "email", "mail" => "email",
    "in_person" => "in_person", "in person" => "in_person", "in-person" => "in_person", "visit" => "in_person",
    "visited" => "in_person", "walk in" => "in_person", "walk-in" => "in_person", "meeting" => "in_person",
    "site visit" => "in_person", "stopped by" => "in_person",
    "note" => "note", "notes" => "note", "general" => "note", "other" => "note", "research" => "note"
  }.freeze

  EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  PHONE_RE = /(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}(?:\s*(?:x|ext\.?|extension)\s*\d+)?/i

  def self.website_key(value)
    key = value.to_s.strip.downcase
    return "" if key.blank?

    key = key.sub(%r{\Ahttps?://}, "").sub(%r{\A//}, "").sub(/\Awww\./, "")
    key = key.split(%r{[/?#]}, 2).first.to_s
    key = key.split("@").last.to_s if key.include?("@")
    key.sub(/:\d+\z/, "").sub(/\.\z/, "")
  end

  def self.humanize_domain(value)
    host = website_key(value)
    return "" if host.blank?

    label = host.split(".").first.to_s
    label.gsub(/[_-]+/, " ").split(/\s+/).map(&:capitalize).join(" ")
  end

  def self.call(rows:, create_missing: false, dry_run: false)
    new(rows: rows, create_missing: create_missing, dry_run: dry_run).call
  end

  def initialize(rows:, create_missing: false, dry_run: false)
    @rows = Array(rows)
    @create_missing = create_missing
    @dry_run = dry_run
  end

  def call
    results = []
    created_leads = {}

    run_in_transaction do
      @rows.each_with_index do |raw_row, idx|
        row = normalize_row(raw_row)
        results << apply_row(row, idx + 1, created_leads)
      end
      raise ActiveRecord::Rollback if @dry_run
    end

    summarize(results)
  end

  private

  def run_in_transaction(&block)
    if @dry_run
      ActiveRecord::Base.transaction(&block)
    else
      yield
    end
  end

  def normalize_row(raw_row)
    row = raw_row.respond_to?(:to_unsafe_h) ? raw_row.to_unsafe_h : raw_row
    row = row.respond_to?(:to_h) ? row.to_h : {}
    normalized = row.transform_keys(&:to_s).slice(*ROW_FIELDS)
    normalized.transform_values { |v| v.is_a?(String) ? v.strip : v }
  end

  def apply_row(row, row_number, created_leads)
    result = blank_result(row_number, row)
    website_key = self.class.website_key(row["website"])
    company_name = row["company_name"].to_s.strip

    if website_key.blank? && company_name.blank?
      result[:errors] << "Row needs a company URL (or company name)"
      result[:outcome] = "error"
      return result
    end

    note_body = row["note"].to_s.strip
    contacts = contacts_from_row(row)
    status = normalize_status(row["status"], result)

    if note_body.blank? && contacts.empty? && status.blank?
      result[:errors] << "Row has no note, new contact, or status change to apply"
      result[:outcome] = "error"
      return result
    end

    lead, lookup_error = find_lead(website_key, company_name, created_leads)
    if lookup_error
      result[:errors] << lookup_error
      result[:outcome] = "error"
      return result
    end

    created = false
    if lead.nil?
      unless @create_missing
        result[:errors] << "No CRM company matches #{website_key.presence || company_name}"
        result[:outcome] = "error"
        return result
      end

      lead = build_new_lead(website_key, company_name, status)
      created = true
    end

    ActiveRecord::Base.transaction(requires_new: true) do
      lead.save! if created

      lead_changed = false
      added, updated = merge_contacts!(lead, contacts, result)
      lead_changed ||= added.positive? || updated.positive?
      if status.present? && lead.status != status
        lead.status = status
        result[:status_changed] = true
        lead_changed = true
      end
      lead.save! if lead_changed

      if note_body.present?
        note = build_note(lead, row, note_body, result)
        note.save!
        result[:note_id] = note.id
        result[:note_added] = true
      end
    end

    if created
      created_leads[website_key] = lead if website_key.present?
      created_leads["name:#{company_name.downcase}"] = lead if company_name.present?
    end

    result[:crm_lead_id] = @dry_run && created ? nil : lead.id
    result[:company_name] = lead.name
    result[:outcome] = created ? "created" : "applied"
    result
  rescue ActiveRecord::RecordInvalid => e
    # The savepoint rolled the DB back; drop any in-memory edits so a later row for the same lead starts clean.
    lead.reload if lead&.persisted?
    result[:errors].concat(e.record.errors.full_messages)
    result[:outcome] = "error"
    result
  end

  def blank_result(row_number, row)
    {
      row: row_number,
      website: row["website"].to_s,
      company_name: row["company_name"].to_s,
      crm_lead_id: nil,
      outcome: "skipped",
      note_added: false,
      note_id: nil,
      contacts_added: 0,
      contacts_updated: 0,
      status_changed: false,
      warnings: [],
      errors: []
    }
  end

  def all_leads
    @all_leads ||= CrmLead.order(:id).to_a
  end

  def leads_by_website
    @leads_by_website ||= all_leads.each_with_object(Hash.new { |h, k| h[k] = [] }) do |lead, acc|
      key = self.class.website_key(lead.website)
      acc[key] << lead if key.present?
    end
  end

  def leads_by_name
    @leads_by_name ||= all_leads.each_with_object(Hash.new { |h, k| h[k] = [] }) do |lead, acc|
      acc[lead.name.to_s.strip.downcase] << lead if lead.name.present?
    end
  end

  def find_lead(website_key, company_name, created_leads)
    if website_key.present?
      return [created_leads[website_key], nil] if created_leads[website_key]

      matches = leads_by_website[website_key]
      if matches.length == 1
        return [matches.first, nil]
      elsif matches.length > 1
        by_name = matches.select { |l| l.name.to_s.strip.casecmp?(company_name) } if company_name.present?
        return [by_name.first, nil] if by_name&.length == 1

        names = matches.map(&:name).join(", ")
        return [nil, "Multiple CRM companies share #{website_key} (#{names}); add a company_name column to disambiguate"]
      end
    end

    if company_name.present?
      key = "name:#{company_name.downcase}"
      return [created_leads[key], nil] if created_leads[key]

      matches = leads_by_name[company_name.downcase]
      return [matches.first, nil] if matches.length == 1
      return [nil, "Multiple CRM companies are named #{company_name}; add the company URL to disambiguate"] if matches.length > 1
    end

    [nil, nil]
  end

  def build_new_lead(website_key, company_name, status)
    name = company_name.presence || self.class.humanize_domain(website_key)
    lead = CrmLead.new(name: name, status: status.presence || "lead")
    lead.website = "https://#{website_key}" if website_key.present?
    lead
  end

  def normalize_status(value, result)
    status = value.to_s.strip.downcase
    return "" if status.blank?
    return status if CrmLead::STATUSES.include?(status)

    result[:warnings] << "Ignored unknown status \"#{value}\""
    ""
  end

  def normalize_contact_method(value)
    key = value.to_s.strip.downcase.gsub(/\s+/, " ")
    return "note" if key.blank?

    CONTACT_METHOD_ALIASES[key] || (CrmNote::CONTACT_METHODS.include?(key) ? key : "note")
  end

  def cast_boolean(value)
    return nil if value.nil? || (value.is_a?(String) && value.strip.blank?)
    return value if value == true || value == false

    key = value.to_s.strip.downcase
    return true if %w[true yes y 1 x reached connected spoke].include?(key)
    return false if %w[false no n 0 none].include?(key)

    ActiveModel::Type::Boolean.new.cast(value)
  end

  def parse_time(value, label, result)
    return nil if value.blank?
    return value if value.is_a?(Time) || value.is_a?(DateTime)
    return value.in_time_zone if value.is_a?(Date)

    parsed = Time.zone.parse(value.to_s)
    result[:warnings] << "Could not read #{label} \"#{value}\"" if parsed.nil?
    parsed
  rescue ArgumentError
    result[:warnings] << "Could not read #{label} \"#{value}\""
    nil
  end

  def build_note(lead, row, body, result)
    note = lead.crm_notes.new(
      body: body,
      title: row["title"].to_s.strip.presence,
      contact_method: normalize_contact_method(row["contact_method"]),
      made_contact: cast_boolean(row["made_contact"]) || false,
      remind_at: parse_time(row["remind_at"], "remind_at", result)
    )
    note_date = parse_time(row["note_date"], "note_date", result)
    note.created_at = note_date if note_date
    note
  end

  def contacts_from_row(row)
    contacts = []
    structured = {
      "name" => row["contact_name"].to_s.strip,
      "email" => row["contact_email"].to_s.strip,
      "phone" => row["contact_phone"].to_s.strip,
      "job_title" => row["contact_title"].to_s.strip
    }
    contacts << structured if structured.values_at("name", "email", "phone").any?(&:present?)

    free_form = row["contacts"]
    free_form = free_form.join("\n") if free_form.is_a?(Array) && free_form.all? { |v| v.is_a?(String) }
    if free_form.is_a?(Array)
      free_form.each do |entry|
        h = entry.respond_to?(:to_unsafe_h) ? entry.to_unsafe_h : entry
        next unless h.respond_to?(:to_h)

        h = h.to_h.transform_keys(&:to_s)
        parsed = {
          "name" => h["name"].to_s.strip,
          "email" => h["email"].to_s.strip,
          "phone" => h["phone"].to_s.strip,
          "job_title" => (h["job_title"] || h["title"]).to_s.strip
        }
        contacts << parsed if parsed.values_at("name", "email", "phone").any?(&:present?)
      end
    elsif free_form.is_a?(String) && free_form.strip.present?
      free_form.split(/\r?\n|;/).map(&:strip).reject(&:blank?).each do |chunk|
        parsed = parse_contact_chunk(chunk)
        contacts << parsed if parsed
      end
    end

    contacts.map { |c| c.reject { |_, v| v.blank? } }
  end

  def parse_contact_chunk(chunk)
    email = chunk[EMAIL_RE].to_s
    rest = email.present? ? chunk.sub(email, " ") : chunk.dup
    phone = rest[PHONE_RE].to_s
    rest = rest.sub(phone, " ") if phone.present?
    rest = rest.gsub(/\b(email|e-mail|phone|cell|mobile|tel)\s*[:=]/i, " ")
    rest = rest.gsub(/[()<>\[\]|]/, " ").gsub(/\s+/, " ").strip
    rest = rest.gsub(/\A[,\-–—:]+|[,\-–—:]+\z/, "").strip

    name = rest
    job_title = ""
    if rest.present?
      parts = rest.split(/\s*(?:,|\s[-–—]\s)\s*/).map(&:strip).reject(&:blank?)
      if parts.length >= 2
        name = parts[0]
        job_title = parts[1..].join(", ")
      end
    end

    return nil if name.blank? && email.blank? && phone.blank?

    { "name" => name, "email" => email, "phone" => phone.strip, "job_title" => job_title }
  end

  def phone_digits(value)
    digits = value.to_s.gsub(/\D/, "")
    digits = digits[-10, 10] if digits.length > 10
    digits
  end

  def contact_matches?(existing, candidate)
    e_email = existing["email"].to_s.strip.downcase
    c_email = candidate["email"].to_s.strip.downcase
    return true if e_email.present? && e_email == c_email

    e_phone = phone_digits(existing["phone"])
    c_phone = phone_digits(candidate["phone"])
    return true if e_phone.present? && e_phone.length >= 7 && e_phone == c_phone

    e_name = existing["name"].to_s.strip.downcase
    c_name = candidate["name"].to_s.strip.downcase
    e_name.present? && e_name == c_name
  end

  def merge_contacts!(lead, contacts, result)
    return [0, 0] if contacts.empty?

    existing = Array(lead.contacts).map { |c| c.respond_to?(:to_h) ? c.to_h.transform_keys(&:to_s) : {} }
    added = 0
    updated = 0

    contacts.each do |candidate|
      match = existing.find { |c| contact_matches?(c, candidate) }
      if match
        filled = false
        %w[name email phone job_title].each do |field|
          next if match[field].present? || candidate[field].blank?

          match[field] = candidate[field]
          filled = true
        end
        if filled
          updated += 1
        else
          result[:warnings] << "Contact #{candidate['name'].presence || candidate['email'].presence || candidate['phone']} already on record"
        end
      else
        existing << candidate
        added += 1
      end
    end

    if added.positive? || updated.positive?
      lead.contacts = existing
      primary = existing.first || {}
      lead.contact_name = primary["name"] if lead.contact_name.blank? && primary["name"].present?
      lead.email = primary["email"] if lead.email.blank? && primary["email"].present?
      lead.phone = primary["phone"] if lead.phone.blank? && primary["phone"].present?
    end

    result[:contacts_added] = added
    result[:contacts_updated] = updated
    [added, updated]
  end

  def summarize(results)
    {
      dry_run: @dry_run,
      applied_count: results.count { |r| r[:outcome] == "applied" },
      created_count: results.count { |r| r[:outcome] == "created" },
      failed_count: results.count { |r| r[:outcome] == "error" },
      notes_added: results.count { |r| r[:note_added] },
      contacts_added: results.sum { |r| r[:contacts_added] },
      contacts_updated: results.sum { |r| r[:contacts_updated] },
      crm_lead_ids: results.map { |r| r[:crm_lead_id] }.compact.uniq,
      results: results
    }
  end
end
