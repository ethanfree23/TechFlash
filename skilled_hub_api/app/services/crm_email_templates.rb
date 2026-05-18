# frozen_string_literal: true

class CrmEmailTemplates
  Template = Struct.new(
    :key,
    :label,
    :description,
    :default_subject,
    :default_body,
    :enabled,
    :show_ctas,
    keyword_init: true
  )

  SALES_CALL_BODY = <<~BODY.freeze
    Hi {{contact_first_name}},

    Thanks again for taking a few minutes to speak with me today.

    I wanted to send over a quick summary of TechFlash and how it can help when your team is short on labor or needs temporary skilled trade help.

    TechFlash is a marketplace for short-term skilled trades work. Companies can post a job, set the trade, rate, location, start date, and job details, then qualified technicians can apply or accept the work.

    It is built for situations like:
    - being down a person for a job
    - needing extra electrical, HVAC, plumbing, maintenance, or construction help
    - covering a short-term labor gap
    - testing out a worker before committing to something longer term
    - filling work without going through a traditional staffing process

    The goal is simple: make it easier for companies to find reliable short-term technicians, and make it easier for technicians to pick up work that fits their schedule.

    You can learn more or create an account here:
    {{signup_url}}

    If you already have a job you want to test with TechFlash, you can post it here:
    {{post_job_url}}

    Happy to help get the first job posted or walk you through how it works.

    Best,

    {{sender_name}}
    TechFlash
    {{sender_email}}
  BODY

  SHORT_FOLLOW_UP_BODY = <<~BODY.freeze
    Hi {{contact_first_name}},

    Thanks again for speaking with me today.

    Here is a quick link to TechFlash:
    {{signup_url}}

    The basic idea is simple: companies can post short-term skilled trade jobs, and available technicians can find and accept work that fits their schedule.

    It can help when you are short a person, need extra coverage, or want temporary help without going through a traditional staffing process.

    If you have a job you want to test with it, I can help get the first one posted.

    Best,
    {{sender_name}}
  BODY

  TEMPLATES = [
    Template.new(
      key: "sales_call_follow_up",
      label: "Sales call follow-up",
      description: "Thank-you after a good phone conversation with company overview and CTAs.",
      default_subject: "Thanks for speaking with me about TechFlash",
      default_body: SALES_CALL_BODY,
      enabled: true,
      show_ctas: true
    ),
    Template.new(
      key: "short_follow_up",
      label: "Short follow-up",
      description: "Brief thank-you with signup link.",
      default_subject: "Good speaking with you — TechFlash info",
      default_body: SHORT_FOLLOW_UP_BODY,
      enabled: true,
      show_ctas: true
    ),
    Template.new(
      key: "job_posting_follow_up",
      label: "Job posting follow-up",
      description: "Follow up after discussing posting a job on TechFlash.",
      default_subject: "Ready to post your first job on TechFlash?",
      default_body: "",
      enabled: false,
      show_ctas: true
    ),
    Template.new(
      key: "company_activation_follow_up",
      label: "Company activation follow-up",
      description: "Encourage a prospect to finish account setup.",
      default_subject: "Finish setting up your TechFlash account",
      default_body: "",
      enabled: false,
      show_ctas: true
    ),
    Template.new(
      key: "custom_email",
      label: "Custom email",
      description: "Write your own subject and body.",
      default_subject: "",
      default_body: "",
      enabled: true,
      show_ctas: false
    )
  ].freeze

  VARIABLE_KEYS = %w[
    contact_first_name
    contact_name
    company_name
    sender_name
    techflash_url
    signup_url
    post_job_url
    calendar_url
    sender_email
  ].freeze

  class << self
    def all
      TEMPLATES
    end

    def find(key)
      TEMPLATES.find { |t| t.key == key.to_s }
    end

    def enabled?(key)
      template = find(key)
      template&.enabled == true
    end

    def default_subject(key)
      find(key)&.default_subject.to_s
    end

    def default_body(key)
      find(key)&.default_body.to_s
    end

    def show_ctas?(key)
      find(key)&.show_ctas == true
    end

    def interpolate(text, context)
      out = text.to_s.dup
      context.each do |var, value|
        next if var.to_s == "calendar_url" && value.blank?

        out = out.gsub("{{#{var}}}", value.to_s)
      end
      # Remove lines that only contained an empty calendar_url placeholder
      out.gsub(/\n\s*\n\s*\n/, "\n\n")
    end

    def build_context(lead:, admin:)
      primary = primary_contact_for(lead)
      contact_name = primary[:name].presence || lead.contact_name.to_s.strip
      first_name = contact_name.split(/\s+/).first.presence || "there"
      sender_name = [admin.first_name, admin.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ")
      sender_name = admin.email.to_s if sender_name.blank?

      base_url = ENV.fetch("FRONTEND_URL", "http://localhost:5173").to_s.chomp("/")
      calendar = ENV["SALES_CALENDAR_URL"].to_s.strip

      {
        "contact_first_name" => first_name,
        "contact_name" => contact_name.presence || "there",
        "company_name" => lead.name.to_s.strip.presence || "your company",
        "sender_name" => sender_name,
        "sender_email" => admin.email.to_s,
        "techflash_url" => "#{base_url}/for-companies",
        "signup_url" => "#{base_url}/login?tab=signup&role=company",
        "post_job_url" => "#{base_url}/jobs/create",
        "calendar_url" => calendar
      }
    end

    def primary_contact_for(lead)
      rows = lead.contacts.is_a?(Array) ? lead.contacts : []
      row = rows.find { |c| c.is_a?(Hash) && (c["is_primary"] == true || c[:is_primary] == true) } || rows.first
      if row.is_a?(Hash)
        {
          name: (row["name"] || row[:name]).to_s.strip,
          email: (row["email"] || row[:email]).to_s.strip.downcase
        }
      else
        { name: lead.contact_name.to_s.strip, email: lead.email.to_s.strip.downcase }
      end
    end

    def allowed_recipient_emails(lead)
      emails = []
      emails << lead.email.to_s.strip.downcase if lead.email.present?
      emails << lead.company_email.to_s.strip.downcase if lead.company_email.present?
      if lead.contacts.is_a?(Array)
        lead.contacts.each do |c|
          next unless c.is_a?(Hash)

          e = (c["email"] || c[:email]).to_s.strip.downcase
          emails << e if e.present?
        end
      end
      emails.uniq.reject(&:blank?)
    end

    def as_json_list
      TEMPLATES.map do |t|
        {
          key: t.key,
          label: t.label,
          description: t.description,
          enabled: t.enabled,
          default_subject: t.default_subject,
          default_body: t.default_body,
          variables: VARIABLE_KEYS
        }
      end
    end
  end
end
