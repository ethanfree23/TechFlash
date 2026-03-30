# Creates a Messages inbox thread for each feedback submission (admin-visible only).
class FeedbackInboxThread
  def self.create_for!(submission)
    return submission.conversation if submission.conversation.present?

    user = submission.user
    sender = user.technician_profile || user.company_profile || user

    conversation = Conversation.create!(
      conversation_type: Conversation::TYPE_FEEDBACK,
      feedback_submission: submission,
      job_id: nil,
      technician_profile_id: user.technician_profile&.id,
      company_profile_id: user.company_profile&.id
    )

    content = <<~TXT.strip
      [#{submission.kind.to_s.capitalize}] #{submission.body}

      Page: #{submission.page_path.presence || "(unknown)"}
    TXT

    conversation.messages.create!(sender: sender, content: content)
    conversation
  end
end
