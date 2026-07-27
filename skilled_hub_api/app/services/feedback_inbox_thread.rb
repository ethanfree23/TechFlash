# Creates a Messages inbox thread for each feedback submission (admin-visible only).
class FeedbackInboxThread
  def self.create_for!(submission, attachments: nil)
    return submission.conversation if submission.conversation.present?

    user = submission.user
    sender = user.technician_profile || user.company_profile || user

    conversation = Conversation.create!(
      conversation_type: Conversation::TYPE_FEEDBACK,
      feedback_submission: submission,
      job_id: nil,
      technician_profile_id: user.technician_profile&.id,
      company_profile_id: user.company_profile&.id,
      inbox_status: "open",
      priority: "normal",
      admin_read_at: nil
    )

    content = <<~TXT.strip
      [#{submission.kind.to_s.capitalize}] #{submission.body}

      Page: #{submission.page_path.presence || "(unknown)"}
    TXT

    message = conversation.messages.create!(sender: sender, content: content)
    attach_uploaded_files(message, attachments)
    conversation
  end

  def self.attach_uploaded_files(message, attachments)
    files = Array(attachments).compact
    return if files.empty?

    message.attachments.attach(files)
  end
  private_class_method :attach_uploaded_files
end
