require "test_helper"

class CrmNotesLoaderTest < ActiveSupport::TestCase
  test "website_key normalizes scheme, www, paths and ports" do
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("https://www.AcmePlumbing.com/about?x=1")
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("acmeplumbing.com/")
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("http://acmeplumbing.com:8080")
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("sales@acmeplumbing.com")
    assert_equal "", CrmNotesLoader.website_key("   ")
  end

  test "humanize_domain builds a readable fallback company name" do
    assert_equal "Northwind Mechanical", CrmNotesLoader.humanize_domain("https://northwind-mechanical.com")
  end

  test "matches by url and appends a note with contact method and reminder" do
    lead = CrmLead.create!(name: "Acme Plumbing", website: "https://www.acmeplumbing.com", status: "lead")

    result = CrmNotesLoader.call(
      rows: [
        {
          website: "acmeplumbing.com/contact",
          note: "Spoke with the owner, wants a demo next week.",
          contact_method: "Phone call",
          made_contact: "yes",
          remind_at: "2030-01-15 09:00",
          status: "contacted"
        }
      ]
    )

    assert_equal 1, result[:applied_count]
    assert_equal 0, result[:failed_count]
    assert_equal 1, result[:notes_added]
    note = lead.crm_notes.reload.last
    assert_equal "call", note.contact_method
    assert_equal true, note.made_contact
    assert_equal "Spoke with the owner, wants a demo next week.", note.body
    assert_equal Time.zone.parse("2030-01-15 09:00"), note.remind_at
    assert_equal "contacted", lead.reload.status
    assert_equal true, result[:results].first[:status_changed]
  end

  test "adds only new contacts and fills blanks on existing ones" do
    lead = CrmLead.create!(
      name: "Beta HVAC",
      website: "betahvac.com",
      status: "lead",
      contacts: [{ "name" => "Dana Fox", "email" => "dana@betahvac.com" }]
    )

    result = CrmNotesLoader.call(
      rows: [
        {
          website: "https://betahvac.com",
          note: "Met the ops team.",
          contact_name: "Dana Fox",
          contact_phone: "555-200-3000",
          contacts: "Lee Park, Service Manager - lee@betahvac.com (555) 200-3001; dana@betahvac.com"
        }
      ]
    )

    row = result[:results].first
    assert_equal "applied", row[:outcome]
    assert_equal 1, row[:contacts_added]
    assert_equal 1, row[:contacts_updated]

    contacts = lead.reload.contacts
    assert_equal 2, contacts.length
    dana = contacts.find { |c| c["name"] == "Dana Fox" }
    assert_equal "555-200-3000", dana["phone"]
    assert_equal true, dana["is_primary"]
    lee = contacts.find { |c| c["name"] == "Lee Park" }
    assert_equal "lee@betahvac.com", lee["email"]
    assert_equal "(555) 200-3001", lee["phone"]
    assert_equal "Service Manager", lee["job_title"]
    assert_equal "Dana Fox", lead.contact_name
    assert_equal "dana@betahvac.com", lead.email
  end

  test "reports unmatched rows unless create_missing is set" do
    result = CrmNotesLoader.call(rows: [{ website: "nobody-here.com", note: "Cold call" }])
    assert_equal 1, result[:failed_count]
    assert_match(/No CRM company matches nobody-here.com/, result[:results].first[:errors].first)
    assert_equal 0, CrmLead.where(website: "https://nobody-here.com").count

    result = CrmNotesLoader.call(rows: [{ website: "nobody-here.com", note: "Cold call" }], create_missing: true)
    assert_equal 1, result[:created_count]
    lead = CrmLead.find_by!(website: "https://nobody-here.com")
    assert_equal "Nobody Here", lead.name
    assert_equal 1, lead.crm_notes.count
  end

  test "reuses a company created earlier in the same batch and falls back to name matching" do
    named = CrmLead.create!(name: "Gamma Electric", status: "lead")

    result = CrmNotesLoader.call(
      rows: [
        { website: "newco.com", company_name: "NewCo Services", note: "First touch" },
        { website: "https://www.newco.com/", note: "Second touch" },
        { company_name: "gamma electric", note: "Matched by name only" }
      ],
      create_missing: true
    )

    assert_equal 0, result[:failed_count]
    assert_equal 1, result[:created_count]
    assert_equal 2, result[:applied_count]
    newco = CrmLead.find_by!(name: "NewCo Services")
    assert_equal 2, newco.crm_notes.count
    assert_equal 1, named.crm_notes.reload.count
  end

  test "flags ambiguous url matches and rows with nothing to apply" do
    CrmLead.create!(name: "Dup One", website: "dup.com", status: "lead")
    CrmLead.create!(name: "Dup Two", website: "https://dup.com", status: "lead")

    result = CrmNotesLoader.call(
      rows: [
        { website: "dup.com", note: "Which one?" },
        { website: "dup.com", company_name: "Dup Two", note: "This one." },
        { website: "dup.com" },
        { note: "No company at all" }
      ]
    )

    rows = result[:results]
    assert_equal "error", rows[0][:outcome]
    assert_match(/Multiple CRM companies share dup.com/, rows[0][:errors].first)
    assert_equal "applied", rows[1][:outcome]
    assert_equal "Dup Two", rows[1][:company_name]
    assert_equal "error", rows[2][:outcome]
    assert_match(/no note, new contact, or status change/, rows[2][:errors].first)
    assert_equal "error", rows[3][:outcome]
    assert_match(/needs a company URL/, rows[3][:errors].first)
  end

  test "dry run reports outcomes without writing" do
    lead = CrmLead.create!(name: "Delta Roofing", website: "deltaroofing.com", status: "lead")

    result = CrmNotesLoader.call(
      rows: [
        { website: "deltaroofing.com", note: "Preview only", contact_name: "Sam Hill" },
        { website: "brand-new.com", note: "Would create" }
      ],
      create_missing: true,
      dry_run: true
    )

    assert_equal true, result[:dry_run]
    assert_equal 1, result[:applied_count]
    assert_equal 1, result[:created_count]
    assert_nil result[:results].last[:crm_lead_id]
    assert_equal 0, lead.crm_notes.reload.count
    assert_equal [], lead.reload.contacts
    assert_nil CrmLead.find_by(website: "https://brand-new.com")
  end

  test "note_date backdates the note and unknown status is ignored with a warning" do
    lead = CrmLead.create!(name: "Echo Solar", website: "echosolar.com", status: "lead")

    result = CrmNotesLoader.call(
      rows: [{ website: "echosolar.com", note: "Old conversation", note_date: "2025-03-02", status: "hot lead" }]
    )

    row = result[:results].first
    assert_equal "applied", row[:outcome]
    assert_includes row[:warnings].join(" "), "Ignored unknown status"
    assert_equal "lead", lead.reload.status
    assert_equal Time.zone.parse("2025-03-02").to_date, lead.crm_notes.first.created_at.to_date
  end
end
