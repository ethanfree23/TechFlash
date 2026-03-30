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
end
