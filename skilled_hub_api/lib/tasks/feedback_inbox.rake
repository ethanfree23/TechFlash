namespace :feedback do
  desc "Create Messages inbox threads for feedback rows that do not have one yet (e.g. before inbox shipped)"
  task backfill_inbox: :environment do
    n = 0
    FeedbackSubmission.includes(:user, :conversation).find_each do |submission|
      next if submission.conversation.present?

      FeedbackInboxThread.create_for!(submission)
      n += 1
      print "."
    rescue StandardError => e
      warn "\nSkipping feedback_submission #{submission.id}: #{e.class} #{e.message}"
    end
    puts "\nDone. Created #{n} inbox thread(s)."
  end

  desc "Set inbox_status=open on feedback conversations missing it (after inbox fields migration)"
  task backfill_inbox_status: :environment do
    updated = Conversation.feedback_threads.where(inbox_status: [nil, ""]).update_all(inbox_status: "open", priority: "normal")
    puts "Updated #{updated} feedback conversation(s)."
  end
end
