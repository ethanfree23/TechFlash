# frozen_string_literal: true

class CrmLeadSendEmailService
  class Error < StandardError; end

  def self.plain_text_to_html(text)
    escaped = ERB::Util.html_escape(text.to_s)
    paragraphs = escaped.split(/\n{2,}/).map(&:strip).reject(&:blank?)
    paragraphs = [escaped] if paragraphs.empty?
    inner = paragraphs.map do |para|
      lines = para.split(/\n/).map { |line| line.strip }.reject(&:blank?)
      content = lines.join("<br>\n")
      %(<p style="margin: 0 0 16px 0; font-size: 16px; color: #374151; line-height: 1.6;">#{content}</p>)
    end.join("\n")
    ActionController::Base.helpers.sanitize(
      inner,
      tags: %w[p br strong em a ul ol li],
      attributes: %w[href style target rel]
    )
  end

  def self.call(lead:, admin_user:, params:, deliver: true, log_activity: true)
    new(lead: lead, admin_user: admin_user, params: params, deliver: deliver, log_activity: log_activity).call
  end

  def initialize(lead:, admin_user:, params:, deliver: true, log_activity: true)
    @lead = lead
    @admin_user = admin_user
    @params = params
    @deliver = deliver
    @log_activity = log_activity
  end

  def call
    validate_template!
    context = CrmEmailTemplates.build_context(lead: @lead, admin: @admin_user)
    subject = CrmEmailTemplates.interpolate(@params[:subject].to_s.strip, context)
    body_plain = CrmEmailTemplates.interpolate(@params[:body].to_s, context)
    raise Error, "Subject is required." if subject.blank?
    raise Error, "Email body is required." if body_plain.blank?

    send_test = ActiveModel::Type::Boolean.new.cast(@params[:send_test])
    to = normalize_email(@params[:to])
    to = normalize_email(@admin_user.email) if send_test
    if to.blank? && !@deliver
      to = CrmEmailTemplates.allowed_recipient_emails(@lead).first
      to ||= normalize_email(@admin_user.email)
    end

    raise Error, "Recipient email is required." if to.blank?

    cc = parse_email_list(@params[:cc])
    bcc = parse_email_list(@params[:bcc])

    validate_emails!(to: to, cc: cc, bcc: bcc)
    validate_recipient_allowed!(to) unless send_test

    template_key = @params[:template_key].to_s
    show_ctas = CrmEmailTemplates.show_ctas?(template_key) && template_key != "custom_email"
    body_html = self.class.plain_text_to_html(body_plain)

    mail = CrmMailer.crm_follow_up(
      to: to,
      cc: cc,
      bcc: bcc,
      subject: subject,
      body_html: body_html,
      body_plain: body_plain,
      reply_to: @admin_user.email,
      show_ctas: show_ctas,
      signup_url: context["signup_url"],
      post_job_url: context["post_job_url"],
      techflash_url: context["techflash_url"]
    )

    preview = {
      subject: subject,
      to: to,
      cc: cc,
      bcc: bcc,
      html_body: html_part_of(mail),
      text_body: text_part_of(mail),
      from: ENV.fetch("MAILER_FROM", "noreply@techflash.example.com"),
      reply_to: @admin_user.email
    }

    return { success: true, preview: preview } unless @deliver

    # Same Mailtrap/SMTP path as all transactional mail (MailDelivery + ActionMailer).
    result = MailDelivery.safe_deliver_result { mail.deliver_now }

    unless result[:success]
      note = log_failed_activity(to, subject, template_key, result[:error]) if @log_activity && !send_test
      return {
        success: false,
        error: result[:error] || "Email delivery failed.",
        crm_note: note
      }
    end

    crm_note = nil
    if @log_activity && !send_test
      crm_note = log_sent_activity(to, subject, template_key, body_plain)
    end

    {
      success: true,
      message: send_test ? "Test email sent to your inbox." : "Email sent successfully.",
      preview: preview,
      crm_notes: crm_notes_payload,
      crm_note: crm_note
    }
  end

  private

  def validate_template!
    key = @params[:template_key].to_s
    template = CrmEmailTemplates.find(key)
    raise Error, "Unknown email template." if template.nil?
    raise Error, "This email template is not available yet." unless template.enabled
  end

  def normalize_email(raw)
    s = raw.to_s.strip.downcase
    return nil if s.blank?

    s
  end

  def parse_email_list(raw)
    raw.to_s.split(/[,;\s]+/).map { |e| normalize_email(e) }.compact.uniq
  end

  def validate_emails!(to:, cc:, bcc:)
    [to, *cc, *bcc].each do |addr|
      unless URI::MailTo::EMAIL_REGEXP.match?(addr)
        raise Error, "Invalid email address: #{addr}"
      end
    end
  end

  def validate_recipient_allowed!(to)
    allowed = CrmEmailTemplates.allowed_recipient_emails(@lead)
    return if allowed.include?(to)

    confirmed = ActiveModel::Type::Boolean.new.cast(@params[:confirm_non_record_recipient])
    raise Error, "Recipient is not on this CRM record. Confirm to send anyway." unless confirmed
  end

  def html_part_of(mail)
    part = mail.html_part
    return part.body.decoded if part
    return mail.body.decoded if mail.content_type.to_s.include?("text/html")

    ""
  end

  def text_part_of(mail)
    part = mail.text_part
    return part.body.decoded if part
    return mail.body.decoded if mail.content_type.to_s.include?("text/plain")

    ""
  end

  def template_label(key)
    CrmEmailTemplates.find(key)&.label || key
  end

  def log_sent_activity(to, subject, template_key, body_plain)
    title = "#{template_label(template_key)} sent"
    body = activity_body(to: to, subject: subject, template_key: template_key, body_plain: body_plain, status: "Sent")
    @lead.crm_notes.create!(
      contact_method: "email",
      title: title,
      body: body,
      made_contact: true
    )
  end

  def log_failed_activity(to, subject, template_key, error_message)
    title = "#{template_label(template_key)} failed"
    body = activity_body(
      to: to,
      subject: subject,
      template_key: template_key,
      body_plain: "",
      status: "Failed",
      error: error_message
    )
    @lead.crm_notes.create!(
      contact_method: "email",
      title: title,
      body: body,
      made_contact: false
    )
  rescue StandardError => e
    Rails.logger.error("[crm_email] failed to log activity: #{e.message}")
    nil
  end

  def activity_body(to:, subject:, template_key:, body_plain:, status:, error: nil)
    sender = [@admin_user.first_name, @admin_user.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ")
    sender = @admin_user.email if sender.blank?
    preview = body_plain.to_s.truncate(2000)
    lines = [
      "Status: #{status}",
      "To: #{to}",
      "Subject: #{subject}",
      "Template: #{template_label(template_key)}",
      "Sent by: #{sender} (#{@admin_user.email})"
    ]
    lines << "Error: #{error}" if error.present?
    lines << ""
    lines << "--- Preview ---"
    lines << preview
    lines.join("\n")
  end

  def crm_notes_payload
    roots = @lead.crm_notes.where(parent_note_id: nil).order(created_at: :asc)
    roots.map { |n| note_json(n) }
  end

  def note_json(note)
    {
      id: note.id,
      crm_lead_id: note.crm_lead_id,
      parent_note_id: note.parent_note_id,
      contact_method: note.contact_method,
      title: note.title,
      body: note.body,
      made_contact: note.made_contact,
      remind_at: note.remind_at&.iso8601,
      created_at: note.created_at,
      updated_at: note.updated_at,
      comments: note.comments.order(created_at: :asc).map { |c| note_json(c) }
    }
  end
end
