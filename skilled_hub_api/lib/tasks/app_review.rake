# frozen_string_literal: true

namespace :app_review do
  desc "Prepare App Store review sample data (reviewer job + conversation). Production-safe and idempotent."
  task prepare: :environment do
    result = AppReview::PrepareService.call!
    puts "app_review:prepare complete"
    puts "  company: #{result.company_email}"
    puts "  technician: #{result.tech_email}"
    puts "  job_id: #{result.job_id}"
    puts "  conversation_id: #{result.conversation_id}"
    puts "  claimable: #{result.claimable}"
    Array(result.warnings).each { |w| puts "  WARNING: #{w}" }
    raise "app_review:prepare finished but job is not claimable" unless result.claimable

    puts "NOTE: Reviewer passwords are NOT stored in git. Deliver them only via App Store Connect."
  end

  desc "Print App Review sample-data status (no passwords)"
  task status: :environment do
    company_email = AppReview::PrepareService::COMPANY_EMAIL
    tech_email = AppReview::PrepareService::TECH_EMAIL
    company_user = User.find_by(email: company_email)
    tech_user = User.find_by(email: tech_email)
    puts "company present=#{company_user.present?} role=#{company_user&.role}"
    puts "technician present=#{tech_user.present?} role=#{tech_user&.role}"
    if company_user&.company_profile
      cp = company_user.company_profile
      open_jobs = Job.where(company_profile_id: cp.id, status: :open).count
      demo = Job.where(company_profile_id: cp.id, title: AppReview::PrepareService::DEMO_JOB_TITLE).order(id: :desc).first
      puts "company open jobs=#{open_jobs} funding_waived=#{cp.job_funding_waived}"
      if demo
        puts "demo job id=#{demo.id} status=#{demo.status} go_live_at=#{demo.go_live_at} waiver=#{demo.posted_under_funding_waiver?}"
      end
    end
    if tech_user&.technician_profile
      tp = tech_user.technician_profile
      puts "tech trade=#{tp.trade_type} class=#{tp.skill_class} membership=#{tp.membership_level} waived=#{tp.membership_fee_waived}"
      puts "tech conversations=#{Conversation.where(technician_profile_id: tp.id).count}"
      if demo = Job.where(title: AppReview::PrepareService::DEMO_JOB_TITLE).order(id: :desc).first
        visible = MembershipPolicy.job_visible_to_technician?(job: demo, technician_profile: tp)
        puts "demo job visible_to_tech=#{visible}"
      end
    end
  end
end
