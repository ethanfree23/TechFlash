# frozen_string_literal: true

module Demo
  # Curated company-acquisition book for the demo CRM.
  # Named records only — this does not generate a lead per marketplace company.
  class CrmSeed
    def self.call
      EnvironmentGuard.assert_demo_database!
      new.call
    end

    def call
      stats = { created: 0, skipped: 0, notes: 0 }
      LEADS.each do |spec|
        if CrmLead.exists?(name: spec[:name])
          stats[:skipped] += 1
          next
        end

        lead = create_lead!(spec)
        stats[:created] += 1
        stats[:notes] += write_activity!(lead, spec[:activity])
      end
      stats
    end

    LEADS = [
      {
        name: "Bayou City Mechanical",
        status: "customer",
        link: true,
        company_types: %w[hvac refrigeration],
        city: "Houston",
        state: "TX",
        zip: "77002",
        street_address: "1400 Louisiana St",
        website: "https://bayoucitymechanical.example",
        company_email: "office@bayoucitymechanical.example",
        company_phone: "713-882-0200",
        instagram_url: "https://instagram.com/bayoucitymechanical",
        bio: "Commercial HVAC contractor. Already posting short-term coverage on TechFlash when crews are stretched.",
        legacy_notes: "Platform customer. Use the account tab for live jobs.",
        activity: [
          {
            contact_method: "call",
            title: "Quarterly check-in",
            body: "Jordan confirmed they will keep posting rooftop coverage when a tech calls out. Asked for a reminder before the next heat wave.",
            made_contact: true,
            days_ago: 2,
            remind: :upcoming,
            reply: "Noted. Follow up Thursday and offer to pre-build the Midtown RTU posting."
          },
          {
            contact_method: "email",
            title: "Sent posting checklist",
            body: "Emailed the short checklist for urgent commercial jobs: rate, days, gate notes, and required certs.",
            made_contact: true,
            days_ago: 6
          }
        ]
      },
      {
        name: "Gulf Coast Electrical Services",
        status: "prospect",
        link: true,
        company_types: %w[electrical],
        city: "Houston",
        state: "TX",
        zip: "77007",
        street_address: "410 Shepherd Dr",
        website: "https://gulfcoastelectrical.example",
        company_email: "dispatch@gulfcoastelectrical.example",
        company_phone: "713-555-0144",
        bio: "Commercial electrical shop. Account is provisioned; first paid posting is the next step.",
        legacy_notes: "Linked company login. Waiting on their first funded job.",
        extra_contacts: [
          { name: "Priya Shah", job_title: "Dispatcher", email: "priya@gulfcoastelectrical.example", phone: "713-555-0145" }
        ],
        activity: [
          {
            contact_method: "in_person",
            title: "Shop visit",
            body: "Walked the office through posting a 480V troubleshooting shift. They want one journeyman-level tech, not a helper.",
            made_contact: true,
            days_ago: 4
          }
        ]
      },
      {
        name: "Capital City Mechanical",
        status: "customer",
        link: true,
        company_types: %w[hvac],
        city: "Austin",
        state: "TX",
        zip: "78701",
        street_address: "200 Congress Ave",
        website: "https://capitalcitymechanical.example",
        company_email: "ops@capitalcitymechanical.example",
        company_phone: "512-555-0188",
        bio: "Austin mechanical contractor using TechFlash for overflow chiller and RTU work.",
        activity: [
          {
            contact_method: "text",
            title: "Confirmed next posting",
            body: "Texted the owner after their South Congress cooling call. They will post a two-day coverage shift this week.",
            made_contact: true,
            days_ago: 1
          }
        ]
      },
      {
        name: "Trinity HVAC Services",
        status: "qualified",
        link: true,
        company_types: %w[hvac refrigeration],
        city: "Dallas",
        state: "TX",
        zip: "75201",
        street_address: "1600 Pacific Ave",
        website: "https://trinityhvac.example",
        company_email: "hello@trinityhvac.example",
        company_phone: "214-555-0160",
        bio: "Dallas HVAC shop with a login. Qualified on commercial rooftop work; proposal not sent yet.",
        activity: [
          {
            contact_method: "call",
            title: "Qualification call",
            body: "They run 11 techs and lose about two emergency calls a week when someone is out. Budget fits the premium company plan.",
            made_contact: true,
            days_ago: 3,
            remind: :upcoming
          }
        ]
      },
      {
        name: "Riverwalk Mechanical",
        status: "lead",
        company_types: %w[hvac],
        city: "San Antonio",
        state: "TX",
        zip: "78205",
        street_address: "300 E Commerce St",
        website: "https://riverwalkmechanical.example",
        company_email: "office@riverwalkmechanical.example",
        company_phone: "210-555-0110",
        bio: "New inbound from a San Antonio contractor referral. No platform account yet.",
        contacts: [
          { name: "Elena Vasquez", job_title: "Owner", email: "elena@riverwalkmechanical.example", phone: "210-555-0111", is_primary: true },
          { name: "Chris Ortega", job_title: "Service manager", email: "chris@riverwalkmechanical.example", phone: "210-555-0112" }
        ],
        activity: [
          {
            contact_method: "note",
            title: "Referral received",
            body: "Referred by a Houston customer. Wants overflow coverage for hotel rooftop units along the River Walk.",
            made_contact: false,
            days_ago: 0
          }
        ]
      },
      {
        name: "Brazos Valley Electric",
        status: "lead",
        age_days: 45,
        company_types: %w[electrical],
        city: "College Station",
        state: "TX",
        zip: "77840",
        street_address: "102 University Dr",
        website: "https://brazosvalleyelectric.example",
        company_email: "info@brazosvalleyelectric.example",
        company_phone: "979-555-0190",
        bio: "College Station electrical contractor. Early lead that has gone quiet.",
        contacts: [
          { name: "Nathan Brooks", job_title: "Owner", email: "nathan@brazosvalleyelectric.example", phone: "979-555-0191", is_primary: true }
        ],
        activity: [
          {
            contact_method: "email",
            title: "Intro email",
            body: "Sent the marketplace overview. No reply.",
            made_contact: false,
            days_ago: 45
          }
        ]
      },
      {
        name: "Oak Cliff Appliance Co",
        status: "contacted",
        age_days: 16,
        company_types: %w[appliance_repair],
        city: "Dallas",
        state: "TX",
        zip: "75208",
        street_address: "800 W Jefferson Blvd",
        company_email: "desk@oakcliffappliance.example",
        company_phone: "214-555-0177",
        bio: "Spoke once about commercial kitchen equipment. No notes logged, so this sits in needs follow-up.",
        contacts: [
          { name: "Jamie Holt", job_title: "Office manager", email: "jamie@oakcliffappliance.example", phone: "214-555-0178", is_primary: true }
        ]
      },
      {
        name: "East Austin Drain Co",
        status: "contacted",
        company_types: %w[plumbing],
        city: "Austin",
        state: "TX",
        zip: "78702",
        street_address: "1401 E 6th St",
        website: "https://eastaustindrain.example",
        company_email: "service@eastaustindrain.example",
        company_phone: "512-555-0133",
        bio: "Drain and jetting shop. Interested, but the owner missed the last scheduled call.",
        contacts: [
          { name: "Andre Williams", job_title: "Owner", email: "andre@eastaustindrain.example", phone: "512-555-0134", is_primary: true }
        ],
        activity: [
          {
            contact_method: "call",
            title: "Missed follow-up",
            body: "Called about a two-day jetting crew. Voicemail. Reminder is overdue.",
            made_contact: false,
            days_ago: 3,
            remind: :overdue
          }
        ]
      },
      {
        name: "Alamo Fire & Life Safety",
        status: "qualified",
        company_types: %w[fire_protection],
        city: "San Antonio",
        state: "TX",
        zip: "78216",
        street_address: "5400 Wurzbach Rd",
        website: "https://alamofire.example",
        company_email: "inspections@alamofire.example",
        company_phone: "210-555-0140",
        bio: "Inspection company that needs licensed techs for annual fire-pump tests.",
        contacts: [
          { name: "Rachel Kim", job_title: "Operations", email: "rachel@alamofire.example", phone: "210-555-0141", is_primary: true }
        ],
        activity: [
          {
            contact_method: "call",
            title: "Scope call",
            body: "They have a backlog of warehouse fire-pump runs and will pay posted hourly rates. Ready for a written proposal.",
            made_contact: true,
            days_ago: 5
          }
        ]
      },
      {
        name: "Plano Solar Partners",
        status: "proposal",
        company_types: %w[solar electrical],
        city: "Plano",
        state: "TX",
        zip: "75024",
        street_address: "5800 Legacy Dr",
        website: "https://planosolar.example",
        company_email: "projects@planosolar.example",
        company_phone: "972-555-0120",
        linkedin_url: "https://www.linkedin.com/company/plano-solar-partners",
        bio: "Commercial solar installer. Proposal is out for a summer install crew.",
        contacts: [
          { name: "Daniel Green", job_title: "Project manager", email: "daniel@planosolar.example", phone: "972-555-0121", is_primary: true },
          { name: "Lauren Scott", job_title: "Controller", email: "lauren@planosolar.example", phone: "972-555-0122" }
        ],
        activity: [
          {
            contact_method: "email",
            title: "Proposal sent",
            body: "Sent premium company pricing and a sample electrical-crew posting. Decision call is today.",
            made_contact: true,
            days_ago: 2,
            remind: :today
          }
        ]
      },
      {
        name: "Pearl District Plumbing",
        status: "prospect",
        company_types: %w[plumbing],
        city: "San Antonio",
        state: "TX",
        zip: "78215",
        street_address: "110 Broadway",
        company_email: "pearl@pearldistrictplumbing.example",
        company_phone: "210-555-0182",
        bio: "Agreed to a login. Account has not been provisioned yet.",
        contacts: [
          { name: "Sofia Martinez", job_title: "Owner", email: "sofia@pearldistrictplumbing.example", phone: "210-555-0183", is_primary: true }
        ],
        activity: [
          {
            contact_method: "text",
            title: "Ready to provision",
            body: "Sofia said to create the company login under her email and she will post a backflow job the same day.",
            made_contact: true,
            days_ago: 1
          }
        ]
      },
      {
        name: "Lone Star Temp Staffing",
        status: "competitor",
        company_types: %w[general_contracting],
        city: "Houston",
        state: "TX",
        zip: "77056",
        street_address: "5000 Westheimer Rd",
        company_email: "sales@lonestartemp.example",
        company_phone: "713-555-0199",
        bio: "Traditional staffing desk. Not a fit for the contractor marketplace.",
        contacts: [
          { name: "Greg Allen", job_title: "Sales", email: "greg@lonestartemp.example", phone: "713-555-0198", is_primary: true }
        ],
        activity: [
          {
            contact_method: "call",
            title: "Not our buyer",
            body: "They resell labor to GCs and do not want contractors posting their own jobs. Marked competitor.",
            made_contact: true,
            days_ago: 12
          }
        ]
      },
      {
        name: "Katy Roofing Collective",
        status: "churned",
        company_types: %w[roofing],
        city: "Katy",
        state: "TX",
        zip: "77494",
        street_address: "2200 Katy Fwy",
        company_email: "office@katyroofing.example",
        company_phone: "281-555-0104",
        bio: "Posted two storm jobs last season, then went back to a text-message crew list.",
        contacts: [
          { name: "Miguel Torres", job_title: "Owner", email: "miguel@katyroofing.example", phone: "281-555-0105", is_primary: true }
        ],
        activity: [
          {
            contact_method: "call",
            title: "Exit conversation",
            body: "Miguel said the crew list is enough until the next hail season. Left the door open for a spring check-in.",
            made_contact: true,
            days_ago: 20
          }
        ]
      },
      {
        name: "Waco Facility Group",
        status: "lost",
        company_types: %w[facility_maintenance],
        city: "Waco",
        state: "TX",
        zip: "76701",
        street_address: "600 Austin Ave",
        company_email: "facilities@wacofacility.example",
        company_phone: "254-555-0166",
        bio: "Wanted a full-time hire, not short-term coverage.",
        contacts: [
          { name: "Patricia Young", job_title: "Facilities director", email: "patricia@wacofacility.example", phone: "254-555-0167", is_primary: true }
        ],
        activity: [
          {
            contact_method: "email",
            title: "Closed lost",
            body: "They filled the role with a direct hire. Not a marketplace fit right now.",
            made_contact: true,
            days_ago: 18
          }
        ]
      }
    ].freeze

    def create_lead!(spec)
      company = spec[:link] ? CompanyProfile.find_by(company_name: spec[:name]) : nil
      user = company&.user
      contacts = contacts_for(spec, user)

      lead = CrmLead.create!(
        name: spec[:name],
        status: spec[:status],
        contact_name: contacts.dig(0, "name"),
        email: contacts.dig(0, "email"),
        phone: contacts.dig(0, "phone"),
        company_email: spec[:company_email],
        company_phone: spec[:company_phone],
        website: spec[:website],
        bio: spec[:bio],
        notes: spec[:legacy_notes],
        street_address: spec[:street_address],
        city: spec[:city],
        state: spec[:state],
        zip: spec[:zip],
        instagram_url: spec[:instagram_url],
        facebook_url: spec[:facebook_url],
        linkedin_url: spec[:linkedin_url],
        company_types: spec[:company_types],
        contacts: contacts,
        linked_user: user,
        linked_company_profile: company
      )

      if spec[:age_days]
        stamped = spec[:age_days].days.ago
        lead.update_columns(created_at: stamped, updated_at: stamped)
      end

      lead
    end

    def contacts_for(spec, user)
      rows =
        if spec[:contacts]
          spec[:contacts].map(&:dup)
        elsif user
          [
            {
              name: [user.first_name, user.last_name].compact.join(" ").presence || "Primary contact",
              email: user.email,
              phone: user.phone,
              job_title: "Owner",
              linked_user_id: user.id,
              is_primary: true
            }
          ]
        else
          []
        end

      Array(spec[:extra_contacts]).each { |extra| rows << extra.dup }
      rows
    end

    def write_activity!(lead, activity)
      return 0 if activity.blank?

      count = 0
      activity.each do |entry|
        note = lead.crm_notes.create!(
          contact_method: entry[:contact_method],
          title: entry[:title],
          body: entry[:body],
          made_contact: entry.fetch(:made_contact, false),
          remind_at: remind_at_for(entry[:remind])
        )
        stamp_note!(note, entry[:days_ago])
        count += 1

        next if entry[:reply].blank?

        reply = lead.crm_notes.create!(
          parent_note: note,
          contact_method: "note",
          title: "Follow-up",
          body: entry[:reply],
          made_contact: false
        )
        stamp_note!(reply, entry[:days_ago].to_i, extra_hours: 2)
        count += 1
      end
      count
    end

    def remind_at_for(token)
      case token
      when :overdue then 1.day.ago.change(hour: 9)
      when :today then Time.current.change(hour: 12)
      when :upcoming then 3.days.from_now.change(hour: 10)
      end
    end

    def stamp_note!(note, days_ago, extra_hours: 0)
      return if days_ago.nil?

      stamped = days_ago.to_i.days.ago + extra_hours.hours
      note.update_columns(created_at: stamped, updated_at: stamped)
    end
  end
end
