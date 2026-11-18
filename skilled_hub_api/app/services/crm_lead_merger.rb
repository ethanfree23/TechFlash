# frozen_string_literal: true

# Merges one CRM company lead into another: field picks, contacts, notes text,
# timeline activity (calls/emails/reminders), and referral pointers. Destroys the source.
class CrmLeadMerger
  Error = Class.new(StandardError)

  MERGEABLE_FIELDS = %i[
    name
    contact_name
    email
    phone
    company_email
    company_phone
    bio
    website
    street_address
    city
    state
    zip
    instagram_url
    facebook_url
    linkedin_url
    status
    linked_user_id
    linked_company_profile_id
  ].freeze

  FILL_FROM_SOURCE_FIELDS = %i[
    contact_name
    email
    phone
    company_email
    company_phone
    bio
    website
    street_address
    city
    state
    zip
    instagram_url
    facebook_url
    linkedin_url
  ].freeze

  Result = Struct.new(:source_id, :target_id, :crm_lead, keyword_init: true)

  def self.call(current:, selected:, merge_direction:, field_sources: {}, combine_contacts: true,
                combine_company_types: true, combine_notes: true, combine_timeline_notes: true)
    new(
      current: current,
      selected: selected,
      merge_direction: merge_direction,
      field_sources: field_sources,
      combine_contacts: combine_contacts,
      combine_company_types: combine_company_types,
      combine_notes: combine_notes,
      combine_timeline_notes: combine_timeline_notes
    ).call
  end

  # Absorb an unlinked duplicate into the linked customer, keeping the platform
  # link/status and filling blank company fields from the unlinked lead.
  def self.absorb_unlinked_into_linked!(source:, target:)
    raise Error, "source and target must differ" if source.id == target.id
    raise Error, "target must be linked to a TechFlash company" unless linked?(target)
    raise Error, "source must be unlinked" if linked?(source)

    field_sources = MERGEABLE_FIELDS.to_h { |field| [field.to_s, "selected"] }
    # Keep linked contacts first so primary contact stays the platform account contact.
    field_sources["contacts"] = "selected"
    FILL_FROM_SOURCE_FIELDS.each do |field|
      field_sources[field.to_s] = "current" if blank_value?(target.public_send(field)) && present_value?(source.public_send(field))
    end

    call(
      current: source,
      selected: target,
      merge_direction: "into_target",
      field_sources: field_sources,
      combine_contacts: true,
      combine_company_types: true,
      combine_notes: true,
      combine_timeline_notes: true
    )
  end

  def self.merge_named_duplicate!(company_name:)
    name = company_name.to_s.strip.downcase
    raise Error, "company_name required" if name.blank?

    leads = CrmLead.where("LOWER(TRIM(name)) = ?", name).order(:id).to_a
    return nil if leads.size < 2

    linked = leads.select { |lead| linked?(lead) }
    unlinked = leads.reject { |lead| linked?(lead) }
    return nil if linked.empty? || unlinked.empty?

    target =
      linked.find { |lead| lead.status.to_s == "customer" } ||
      linked.max_by { |lead| [lead.updated_at.to_i, lead.id] }
    source = unlinked.max_by { |lead| [lead.crm_notes.count, lead.updated_at.to_i, lead.id] }

    absorb_unlinked_into_linked!(source: source, target: target)
  end

  def self.linked?(lead)
    lead.linked_user_id.present? || lead.linked_company_profile_id.present?
  end

  def self.blank_value?(value)
    value.respond_to?(:blank?) ? value.blank? : value.nil? || value.to_s.strip.empty?
  end

  def self.present_value?(value)
    !blank_value?(value)
  end

  def self.compact_contact_entry(entry)
    h = entry.respond_to?(:to_h) ? entry.to_h : {}
    name = h["name"].to_s.strip.presence || h[:name].to_s.strip.presence
    email = h["email"].to_s.strip.presence || h[:email].to_s.strip.presence
    phone = h["phone"].to_s.strip.presence || h[:phone].to_s.strip.presence
    return nil if name.blank? && email.blank? && phone.blank?

    out = { "name" => name, "email" => email, "phone" => phone }
    %w[job_title extension instagram_url facebook_url linkedin_url].each do |k|
      v = h[k].to_s.strip.presence || h[k.to_sym].to_s.strip.presence
      out[k] = v if v.present?
    end
    sac_raw = h["same_as_company"] || h[:same_as_company]
    if sac_raw.is_a?(Hash)
      sac = {}
      %w[email phone socials].each do |k|
        val = sac_raw[k] || sac_raw[k.to_sym]
        next if val.nil?

        sac[k] = ActiveModel::Type::Boolean.new.cast(val)
      end
      out["same_as_company"] = sac if sac.any? { |_, v| v }
    end

    lid_raw = h["linked_user_id"] || h[:linked_user_id]
    if lid_raw.present?
      lid = lid_raw.to_i
      out["linked_user_id"] = lid if lid.positive?
    end

    out
  end

  def initialize(current:, selected:, merge_direction:, field_sources: {}, combine_contacts: true,
                 combine_company_types: true, combine_notes: true, combine_timeline_notes: true)
    @current = current
    @selected = selected
    @merge_direction = merge_direction.to_s
    @field_sources = field_sources.to_h.transform_keys(&:to_s)
    @combine_contacts = combine_contacts
    @combine_company_types = combine_company_types
    @combine_notes = combine_notes
    @combine_timeline_notes = combine_timeline_notes
  end

  def call
    raise Error, "Target must be different from source" if @current.id == @selected.id

    keep_current = @merge_direction == "into_current"
    source = keep_current ? @selected : @current
    target = keep_current ? @current : @selected
    source_id = source.id
    target_id = target.id

    ActiveRecord::Base.transaction do
      apply_merge_fields!(target)
      move_source_notes_to_target!(source, target) if @combine_timeline_notes
      reassign_referrals!(source, target)
      source.destroy!
    end

    Result.new(source_id: source_id, target_id: target_id, crm_lead: target.reload)
  end

  private

  def pick_merge_value(field, target)
    selected_source = @field_sources[field.to_s].to_s
    picked =
      case selected_source
      when "selected"
        @selected.public_send(field)
      when "current"
        @current.public_send(field)
      else
        target.public_send(field)
      end
    field.to_sym.in?(%i[linked_user_id linked_company_profile_id]) ? picked.presence : picked
  end

  def apply_merge_fields!(target)
    attrs = {}
    MERGEABLE_FIELDS.each do |field|
      attrs[field] = pick_merge_value(field, target)
    end

    attrs[:company_types] =
      if @combine_company_types
        (Array(@current.company_types) | Array(@selected.company_types))
      else
        Array(pick_merge_value(:company_types, target))
      end

    attrs[:contacts] =
      if @combine_contacts
        merge_contacts
      else
        Array(pick_merge_value(:contacts, target))
      end

    attrs[:notes] =
      if @combine_notes
        merge_text_notes(@current.notes, @selected.notes)
      else
        pick_merge_value(:notes, target)
      end

    primary = Array(attrs[:contacts]).first || {}
    attrs[:contact_name] = primary[:name].presence || primary["name"].presence || attrs[:contact_name]
    attrs[:email] = primary[:email].presence || primary["email"].presence || attrs[:email]
    attrs[:phone] = primary[:phone].presence || primary["phone"].presence || attrs[:phone]

    target.update!(attrs)
  end

  def merge_contacts
    preferred = @field_sources["contacts"].to_s == "selected" ? @selected : @current
    secondary = preferred == @current ? @selected : @current
    dedupe_contacts(Array(preferred.contacts) + Array(secondary.contacts))
  end

  def dedupe_contacts(contacts)
    by_key = {}
    contacts.each do |entry|
      compact = self.class.compact_contact_entry(entry)
      next unless compact

      name = compact["name"].to_s.strip.presence
      email = compact["email"].to_s.strip.presence
      phone_digits = compact["phone"].to_s.gsub(/\D/, "")
      phone_digits = phone_digits[-10, 10] if phone_digits.present?
      key = [name.to_s.downcase, email.to_s.downcase, phone_digits.to_s].join("|")
      prev = by_key[key]
      if prev.nil?
        by_key[key] = compact
      else
        prev_lid = prev["linked_user_id"].present?
        new_lid = compact["linked_user_id"].present?
        by_key[key] = compact if new_lid && !prev_lid
      end
    end
    by_key.values
  end

  def merge_text_notes(current_notes, selected_notes)
    texts = [current_notes, selected_notes].map { |value| value.to_s.strip }.reject(&:blank?).uniq
    texts.join("\n\n---\n\n")
  end

  def move_source_notes_to_target!(source, target)
    return if source.id == target.id

    now = Time.current
    CrmNote.where(crm_lead_id: source.id).update_all(crm_lead_id: target.id, updated_at: now)
  end

  def reassign_referrals!(source, target)
    return if source.id == target.id
    return unless defined?(ReferralSubmission)

    ReferralSubmission.where(crm_lead_id: source.id).update_all(crm_lead_id: target.id, updated_at: Time.current)
  end
end
