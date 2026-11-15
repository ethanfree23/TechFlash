require "test_helper"

class CrmNotesLoaderTest < ActiveSupport::TestCase
  test "website_key normalizes scheme, www, paths and ports" do
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("https://www.AcmePlumbing.com/about?x=1")
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("acmeplumbing.com/")
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("http://acmeplumbing.com:8080")
    assert_equal "acmeplumbing.com", CrmNotesLoader.website_key("sales@acmeplumbing.com")
    assert_equal "", CrmNotesLoader.website_key("   ")
  end

  test "website_key rejects company names and placeholders typed into the URL column" do
    assert_equal "", CrmNotesLoader.website_key("Acme Plumbing")
    assert_equal "", CrmNotesLoader.website_key("N/A")
    assert_equal "", CrmNotesLoader.website_key("none")
    assert_equal "", CrmNotesLoader.website_key("-")
    assert_equal "", CrmNotesLoader.website_key("unknown")
  end

  test "a company name in the URL column matches or creates by name instead of a bogus domain" do
    existing = CrmLead.create!(name: "Gamma Electric", status: "lead")

    result = CrmNotesLoader.call(
      rows: [
        { website: "Gamma Electric", note: "Matched by name from the URL column" },
        { website: "N/A", company_name: "Brand New Shop", note: "Placeholder URL ignored" },
        { website: "none", note: "Nothing usable" }
      ],
      create_missing: true
    )

    rows = result[:results]
    assert_equal "applied", rows[0][:outcome]
    assert_equal existing.id, rows[0][:crm_lead_id]
    assert_equal "created", rows[1][:outcome]
    created = CrmLead.find_by!(name: "Brand New Shop")
    assert_nil created.website
    assert_equal "error", rows[2][:outcome]
    assert_match(/needs a company URL/, rows[2][:errors].first)
    assert_nil CrmLead.find_by(name: "N")
    assert_nil CrmLead.find_by(name: "None")
  end

  test "reads US-format, ISO, spelled-out and Excel-serial dates" do
    lead = CrmLead.create!(name: "Date Co", website: "dateco.com", status: "lead")

    result = CrmNotesLoader.call(
      rows: [
        { website: "dateco.com", note: "a", remind_at: "10/5/2026", note_date: "10/24/2026" },
        { website: "dateco.com", note: "b", remind_at: "2026-11-02", note_date: "Oct 24, 2026" },
        { website: "dateco.com", note: "c", remind_at: 46_304, note_date: "46303.5" },
        { website: "dateco.com", note: "d", remind_at: "next tuesday", note_date: "N/A" }
      ]
    )

    assert_equal 0, result[:failed_count]
    notes = lead.crm_notes.reload.reorder(:id).to_a
    assert_equal Date.new(2026, 10, 5), notes[0].remind_at.to_date, "10/5/2026 must be October 5, not May 10"
    assert_equal Date.new(2026, 10, 24), notes[0].created_at.to_date
    assert_equal Date.new(2026, 11, 2), notes[1].remind_at.to_date
    assert_equal Date.new(2026, 10, 24), notes[1].created_at.to_date
    assert_equal Date.new(2026, 10, 9), notes[2].remind_at.to_date
    assert_equal Date.new(2026, 10, 8), notes[2].created_at.to_date
    assert_nil notes[3].remind_at
    assert_in_delta Time.current, notes[3].created_at, 5.seconds
    assert_includes result[:results][3][:warnings].join(" "), 'Could not read remind_at "next tuesday"'
  end

  test "an unexpected error in one row does not abort the batch" do
    lead = CrmLead.create!(name: "Stable Co", website: "stable.com", status: "lead")

    CrmNote.stub(:new, ->(*) { raise "boom" }) do
      result = CrmNotesLoader.call(
        rows: [
          { website: "stable.com", note: "will blow up" },
          { website: "stable.com", status: "contacted" }
        ]
      )
      assert_equal "error", result[:results][0][:outcome]
      assert_match(/Could not apply this row/, result[:results][0][:errors].first)
      assert_equal "applied", result[:results][1][:outcome]
    end

    assert_equal "contacted", lead.reload.status
    assert_equal 0, lead.crm_notes.count
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

  test "re-uploading the same rows appends another note without duplicating the company or contact" do
    lead = CrmLead.create!(name: "Reup Co", website: "reup.com", status: "lead")
    rows = [{ website: "reup.com", note: "Same day note", contact_name: "Pat Rivera", contact_email: "pat@reup.com" }]

    first = CrmNotesLoader.call(rows: rows)
    second = CrmNotesLoader.call(rows: rows)

    assert_equal 0, first[:failed_count]
    assert_equal 0, second[:failed_count]
    assert_equal 1, CrmLead.where("lower(name) = ?", "reup co").count
    assert_equal 2, lead.crm_notes.reload.count
    assert_equal 1, lead.reload.contacts.length
    assert_equal 0, second[:results].first[:contacts_added]
    assert_includes second[:results].first[:warnings].join(" "), "already on record"
  end

  test "filling a blank phone on an existing contact preserves linked_user_id and socials" do
    owner = User.create!(
      email: "company+loader_preserve@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile = CompanyProfile.create!(user: owner, company_name: "Preserve Co", phone: "555-000-0001", bio: "Test")
    owner.update_column(:company_profile_id, profile.id)
    login = User.create!(
      email: "login+preserve@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      company_profile_id: profile.id
    )

    lead = CrmLead.create!(
      name: "Preserve Co",
      website: "preserve.com",
      status: "lead",
      linked_company_profile_id: profile.id,
      linked_user_id: owner.id,
      contacts: [{
        "name" => "Pat Rivera",
        "email" => "pat@preserve.com",
        "linked_user_id" => login.id,
        "instagram_url" => "https://instagram.com/pat",
        "is_primary" => true
      }]
    )

    result = CrmNotesLoader.call(
      rows: [{ website: "preserve.com", note: "Got their cell", contact_name: "Pat Rivera", contact_phone: "555-111-2222" }]
    )

    assert_equal 0, result[:failed_count]
    assert_equal 1, result[:results].first[:contacts_updated]
    pat = lead.reload.contacts.find { |c| c["name"] == "Pat Rivera" }
    assert_equal "555-111-2222", pat["phone"]
    assert_equal login.id, pat["linked_user_id"]
    assert_equal "https://instagram.com/pat", pat["instagram_url"]
    assert_equal true, pat["is_primary"]
  end

  test "mixed valid and invalid rows apply the good ones and report the bad ones" do
    CrmLead.create!(name: "Keep Going", website: "keepgoing.com", status: "lead")

    result = CrmNotesLoader.call(
      rows: [
        { website: "keepgoing.com", note: "Good row" },
        { website: "", note: "No company" },
        { website: "brand-new-mixed.com", company_name: "Brand New Mixed", note: "Create me", contact_name: "Sam" },
        { website: "keepgoing.com" },
        { company_name: "Brand New Mixed", note: "Second note on the new company" }
      ],
      create_missing: true
    )

    assert_equal 1, result[:created_count]
    assert_equal 2, result[:applied_count]
    assert_equal 2, result[:failed_count]
    assert_equal 3, result[:notes_added]
    assert_equal "error", result[:results][1][:outcome]
    assert_equal "error", result[:results][3][:outcome]
    created = CrmLead.find_by!(name: "Brand New Mixed")
    assert_equal 2, created.crm_notes.count
    assert_equal 1, created.contacts.length
  end

  test "blank optional fields still create a note on a matched company" do
    lead = CrmLead.create!(name: "Sparse Co", website: "sparse.com", status: "lead")

    result = CrmNotesLoader.call(
      rows: [{
        website: "sparse.com",
        company_name: "",
        note: "Just a note",
        contact_method: "",
        made_contact: "",
        note_date: "",
        remind_at: "",
        status: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        contacts: ""
      }]
    )

    assert_equal 0, result[:failed_count]
    note = lead.crm_notes.reload.last
    assert_equal "Just a note", note.body
    assert_equal "note", note.contact_method
    assert_equal false, note.made_contact
    assert_nil note.remind_at
    assert_equal [], lead.reload.contacts
  end
end
