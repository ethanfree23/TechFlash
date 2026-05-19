# frozen_string_literal: true

require "test_helper"

class CrmLeadSendEmailServiceTest < ActiveSupport::TestCase
  setup do
    @admin = User.create!(
      email: "admin+crm_email_svc@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin,
      first_name: "Ethan",
      last_name: "Admin",
      phone: "(719) 339-5617"
    )
    @lead = CrmLead.create!(
      name: "Rodriguez Electric",
      contact_name: "Mike Rodriguez",
      email: "mike@rodiguez-electric.example.com",
      status: "lead"
    )
  end

  test "interpolates template variables" do
    result = CrmLeadSendEmailService.call(
      lead: @lead,
      admin_user: @admin,
      params: {
        template_key: "sales_call_follow_up",
        to: "mike@rodiguez-electric.example.com",
        subject: "Hi {{contact_first_name}}",
        body: "Hello {{contact_first_name}} from {{sender_name}} at {{company_name}}."
      },
      deliver: false,
      log_activity: false
    )

    assert result[:success]
    assert_includes result[:preview][:subject], "Mike"
    assert_includes result[:preview][:text_body], "Ethan Admin"
    assert_includes result[:preview][:text_body], "Rodriguez Electric"
  end

  test "converts markdown here links to html anchors and plain text fallbacks" do
    signup = "https://www.techflash.app/login?tab=signup&role=company"
    post_job = "https://www.techflash.app/jobs/create"
    body = <<~BODY.strip
      Learn more [here](#{signup}).

      Post a job [here](#{post_job}).
    BODY

    result = CrmLeadSendEmailService.call(
      lead: @lead,
      admin_user: @admin,
      params: {
        template_key: "sales_call_follow_up",
        to: "mike@rodiguez-electric.example.com",
        subject: "Hi",
        body: body
      },
      deliver: false,
      log_activity: false
    )

    assert result[:success]
    html = result[:preview][:html_body]
    # HTML body escapes & as &amp; in attribute values
    assert(
      html.include?(%(href="#{signup}")) ||
        html.include?(%(href="#{signup.gsub('&', '&amp;')}")),
    )
    assert_includes html, ">here</a>"
    assert_includes result[:preview][:text_body], "here (#{signup})"
    assert_includes result[:preview][:text_body], "here (#{post_job})"
  end

  test "default sales template includes sender phone when set on admin" do
    context = CrmEmailTemplates.build_context(lead: @lead, admin: @admin)
    body = CrmEmailTemplates.interpolate(CrmEmailTemplates.default_body("sales_call_follow_up"), context)

    assert_includes body, "(719) 339-5617"
    assert_includes body, "[here]("
  end

  test "rejects unknown template" do
    assert_raises(CrmLeadSendEmailService::Error) do
      CrmLeadSendEmailService.call(
        lead: @lead,
        admin_user: @admin,
        params: {
          template_key: "not_real",
          to: "mike@rodiguez-electric.example.com",
          subject: "Hi",
          body: "Body"
        },
        deliver: false
      )
    end
  end

  test "rejects non-record recipient without confirm" do
    assert_raises(CrmLeadSendEmailService::Error) do
      CrmLeadSendEmailService.call(
        lead: @lead,
        admin_user: @admin,
        params: {
          template_key: "sales_call_follow_up",
          to: "stranger@example.com",
          subject: "Hi",
          body: "Hello there"
        },
        deliver: false
      )
    end
  end

  test "allows non-record recipient with confirm flag" do
    result = CrmLeadSendEmailService.call(
      lead: @lead,
      admin_user: @admin,
      params: {
        template_key: "sales_call_follow_up",
        to: "stranger@example.com",
        subject: "Hi",
        body: "Hello there",
        confirm_non_record_recipient: true
      },
      deliver: false,
      log_activity: false
    )

    assert result[:success]
    assert_equal "stranger@example.com", result[:preview][:to]
  end

  test "send creates crm note on success" do
    ActionMailer::Base.delivery_method = :test
    ActionMailer::Base.deliveries.clear

    result = CrmLeadSendEmailService.call(
      lead: @lead,
      admin_user: @admin,
      params: {
        template_key: "short_follow_up",
        to: "mike@rodiguez-electric.example.com",
        subject: "Quick follow-up",
        body: "Thanks for the call."
      },
      deliver: true,
      log_activity: true
    )

    assert result[:success]
    assert_equal 1, ActionMailer::Base.deliveries.size
    note = @lead.crm_notes.order(:id).last
    assert_equal "email", note.contact_method
    assert_match(/sent/i, note.title)
    assert_includes note.body, "mike@rodiguez-electric.example.com"
  end
end
