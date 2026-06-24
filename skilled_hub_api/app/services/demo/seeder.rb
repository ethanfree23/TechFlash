# frozen_string_literal: true

module Demo
  class Seeder
    include MarketData

    # Default 20× vs original demo volume (15 techs / 32 jobs per city).
    DEMO_SCALE = Integer(ENV.fetch("DEMO_SEED_SCALE", "20"))

    BASE_JOB_BUCKETS = [
      { key: :open, count: 10 },
      { key: :claimed, count: 7 },
      { key: :in_progress, count: 6 },
      { key: :pending_review, count: 5 },
      { key: :reviewed, count: 4 }
    ].freeze

    BASE_TECHNICIANS_PER_MARKET = 15
    BASE_COMPANIES_PER_MARKET = 8
    BASE_OPEN_JOBS_PER_CITY = 10
    DEMO_COMPANY_JOBS_TARGET = Integer(ENV.fetch("DEMO_COMPANY_JOBS", "105"))
    DEMO_COMPANY_JOB_INDEX_OFFSET = 100_000
    DEMO_TECHNICIAN_JOBS_TARGET = Integer(ENV.fetch("DEMO_TECHNICIAN_JOBS", "25"))
    DEMO_TECHNICIAN_JOBS_FROM_DEMO_COMPANY = Integer(ENV.fetch("DEMO_TECHNICIAN_COMPANY_JOBS", "10"))
    DEMO_TECHNICIAN_JOB_INDEX_OFFSET = 200_000
    DEMO_FINANCIAL_MULTIPLIER = BigDecimal(ENV.fetch("DEMO_FINANCIAL_MULTIPLIER", "2.4"))
    DEMO_FINANCIAL_BASE_BOOST_CENTS = Integer(ENV.fetch("DEMO_FINANCIAL_BASE_BOOST_CENTS", "4800"))

    # Technician demo jobs: claimed/reserved, active, pending review, completed (no unclaimed open).
    DEMO_TECHNICIAN_JOB_BUCKETS = [
      { key: :claimed, count: 7 },
      { key: :in_progress, count: 6 },
      { key: :pending_review, count: 5 },
      { key: :reviewed, count: 7 }
    ].freeze

    class << self
      def reset!
        new.reset!
      end

      def seed!
        new.seed!
      end
    end

    def reset!
      Demo::ResetGuard.verify!
      clear_all!
      seed!
    end

    def seed!
      @stats = { users: 0, companies: 0, technicians: 0, jobs: 0, messages: 0, ratings: 0, payments: 0 }
      @demo_users = {}
      @market_companies = {}
      @market_technicians = {}
      @flagship_jobs = {}
      @reviewed_demo_job_id = nil

      create_demo_accounts!
      MARKETS.each_key { |market_key| populate_market!(market_key) }
      seed_demo_company_jobs!
      seed_demo_technician_jobs!
      seed_demo_feedback!
      seed_demo_admin_notifications!
      seed_login_events!
      attach_flagship_to_stats!
      @stats
    end

    def clear_all!
      ActiveStorage::Attachment.delete_all
      ActiveStorage::Blob.delete_all
      EmailDeliveryLog.delete_all
      SmsDeliveryLog.delete_all
      StripeWebhookEvent.delete_all
      JobAlertPreference.delete_all
      SimulatedTechnicianMarker.delete_all
      CouponAssignment.delete_all
      MarketingLead.delete_all
      Message.delete_all
      Conversation.delete_all
      JobIssueReport.delete_all
      Rating.delete_all
      Payment.delete_all
      JobApplication.delete_all
      JobCounterOffer.where.not(parent_offer_id: nil).delete_all
      JobCounterOffer.delete_all
      SavedJobSearch.delete_all
      FavoriteTechnician.delete_all
      Document.delete_all
      ReferralSubmission.delete_all
      CrmNote.where.not(parent_note_id: nil).delete_all
      CrmNote.delete_all
      CrmLead.delete_all
      AppNotification.delete_all
      Job.delete_all
      FeedbackSubmission.delete_all
      UserLoginEvent.delete_all
      User.update_all(company_profile_id: nil)
      CompanyProfile.delete_all
      TechnicianProfile.delete_all
      User.delete_all
    end

    private

    def create_demo_accounts!
      admin = upsert_user!(DEMO_EMAILS[:admin], :admin, "Demo", "Admin", phone: "713-882-0100")
      company_user = upsert_user!(DEMO_EMAILS[:company], :company, "Jordan", "Reed", phone: "713-882-0200")
      tech_user = upsert_user!(DEMO_EMAILS[:technician], :technician, "Marcus", "Alvarez", phone: "713-882-0300")

      hou = MARKETS[:houston]
      demo_company = CompanyProfile.create!(
        user: company_user,
        company_name: "Bayou City Mechanical",
        industry: "HVAC & Mechanical",
        location: "#{hou[:city]}, #{hou[:state]}",
        state: hou[:state],
        phone: "713-882-0200",
        bio: "Commercial HVAC and mechanical contractor serving Greater Houston. Posting short-term coverage when crews are stretched.",
        membership_level: "premium",
        membership_status: "active",
        primary_hiring_need: "HVAC technicians",
        service_cities: [hou[:city]]
      )

      demo_tech = TechnicianProfile.create!(
        user: tech_user,
        trade_type: "HVAC",
        experience_years: 9,
        availability: "Full-time",
        location: "Houston, TX",
        address: "1400 Louisiana St",
        city: hou[:city],
        state: hou[:state],
        zip_code: "77002",
        country: "United States",
        bio: "EPA-certified HVAC technician. Commercial RTUs, chillers, and controls. OSHA 10, reliable communication.",
        phone: "713-882-0300",
        membership_level: "premium",
        membership_status: "active",
        background_verified: true,
        specialties: %w[HVAC Refrigeration]
      )
      demo_tech.update_columns(latitude: hou[:lat], longitude: hou[:lng])
      company_user.update_column(:company_profile_id, demo_company.id)

      @demo_users = { admin: admin, company: company_user, technician: tech_user }
      @demo_company_profile = demo_company
      @demo_technician_profile = demo_tech
      @stats[:users] += 3
      @stats[:companies] += 1
      @stats[:technicians] += 1
    end

    def populate_market!(market_key)
      market = MARKETS[market_key]
      companies = []
      companies_per_market.times do |idx|
        name = company_name_for(market, market_key, idx)
        next if name == "Bayou City Mechanical" && market_key == :houston

        email = "demo.co.#{market_key}.#{idx}@techflash.app"
        contact_first = CONTACT_FIRST_NAMES[idx % CONTACT_FIRST_NAMES.size]
        contact_last = CONTACT_LAST_NAMES[(idx + 3) % CONTACT_LAST_NAMES.size]
        user = upsert_user!(email, :company, contact_first, contact_last,
                            phone: "#{market[:area_code]}-882-#{format('%04d', 1000 + idx)}")
        cp = CompanyProfile.create!(
          user: user,
          company_name: name,
          industry: SKILL_CLASSES[idx % SKILL_CLASSES.size],
          location: "#{market[:city]}, #{market[:state]}",
          state: market[:state],
          phone: user.phone,
          bio: "#{name} hires skilled trades for short-term projects across #{market[:city]}.",
          membership_level: MEMBERSHIP_LEVELS[idx % MEMBERSHIP_LEVELS.size],
          membership_status: idx.even? ? "active" : "trialing",
          service_cities: [market[:city]]
        )
        companies << cp
        @stats[:companies] += 1
      end
      companies.unshift(@demo_company_profile) if market_key == :houston
      @market_companies[market_key] = companies

      techs = []
      technicians_per_market.times do |i|
        email = "demo.tech.#{market_key}.#{i}@techflash.app"
        fn = TECH_FIRST_NAMES[(i + market_key.to_s.length) % TECH_FIRST_NAMES.size]
        ln = TECH_LAST_NAMES[(i + 7) % TECH_LAST_NAMES.size]
        user = upsert_user!(email, :technician, fn, ln,
                            phone: "#{market[:area_code]}-882-#{format('%04d', 2000 + i)}")
        trade = SKILL_CLASSES[i % SKILL_CLASSES.size]
        tp = TechnicianProfile.create!(
          user: user,
          trade_type: trade,
          experience_years: 3 + (i % 12),
          availability: i.even? ? "Full-time" : "Weekdays",
          location: "#{market[:city]}, #{market[:state]}",
          city: market[:city],
          state: market[:state],
          zip_code: format("%05d", 77_000 + i),
          country: "United States",
          bio: "#{fn} #{ln} — #{trade} specialist with #{3 + (i % 12)}+ years in #{market[:city]}. Licensed, insured, strong references.",
          phone: user.phone,
          membership_level: MEMBERSHIP_LEVELS[(i + 1) % MEMBERSHIP_LEVELS.size],
          membership_status: "active",
          background_verified: i % 3 != 0,
          specialties: [trade]
        )
        lat_offset = BigDecimal((((i % 5) - 2) * 0.02).to_s)
        lng_offset = BigDecimal((((i % 7) - 3) * 0.02).to_s)
        tp.update_columns(
          latitude: market[:lat] + lat_offset,
          longitude: market[:lng] + lng_offset
        )
        techs << tp
        @stats[:technicians] += 1
      end
      techs.unshift(@demo_technician_profile) if market_key == :houston
      @market_technicians[market_key] = techs.uniq

      job_index = 0
      job_buckets.each do |bucket|
        bucket[:count].times do
          create_job_for_bucket!(
            market_key: market_key,
            bucket: bucket[:key],
            index: job_index,
            companies: companies,
            techs: @market_technicians[market_key]
          )
          job_index += 1
        end
      end
    end

    def job_buckets
      BASE_JOB_BUCKETS.map { |bucket| { key: bucket[:key], count: bucket[:count] * DEMO_SCALE } }
    end

    def technicians_per_market
      BASE_TECHNICIANS_PER_MARKET * DEMO_SCALE
    end

    def companies_per_market
      BASE_COMPANIES_PER_MARKET * DEMO_SCALE
    end

    def open_jobs_per_city
      BASE_OPEN_JOBS_PER_CITY * DEMO_SCALE
    end

    def company_name_for(market, market_key, idx)
      seeded = market[:companies][idx]
      return seeded if seeded.present?

      skill = SKILL_CLASSES[idx % SKILL_CLASSES.size]
      suffix = market_key.to_s.split("_").map(&:capitalize).join
      "#{market[:city]} #{skill} Services #{suffix}-#{idx + 1}"
    end

    def seed_demo_company_jobs!
      return unless @demo_company_profile

      techs = @market_technicians[:houston] || [@demo_technician_profile].compact
      return if techs.empty?

      job_index = DEMO_COMPANY_JOB_INDEX_OFFSET
      demo_company_job_buckets.each do |bucket|
        bucket[:count].times do
          create_job_for_bucket!(
            market_key: :houston,
            bucket: bucket[:key],
            index: job_index,
            companies: [@demo_company_profile],
            techs: techs,
            forced_company: @demo_company_profile,
            financial_profile: :demo_company
          )
          job_index += 1
        end
      end
      @stats[:demo_company_jobs] = @demo_company_profile.jobs.count
    end

    def seed_demo_technician_jobs!
      return unless @demo_technician_profile && @demo_company_profile

      other_companies = (@market_companies[:houston] || []).reject { |c| c.id == @demo_company_profile.id }
      return if other_companies.empty?

      job_index = DEMO_TECHNICIAN_JOB_INDEX_OFFSET
      slot = 0
      demo_technician_job_buckets.each do |bucket|
        bucket[:count].times do
          company =
            if slot < DEMO_TECHNICIAN_JOBS_FROM_DEMO_COMPANY
              @demo_company_profile
            else
              other_companies[(slot - DEMO_TECHNICIAN_JOBS_FROM_DEMO_COMPANY) % other_companies.size]
            end
          create_job_for_bucket!(
            market_key: :houston,
            bucket: bucket[:key],
            index: job_index,
            companies: [company],
            techs: [@demo_technician_profile],
            forced_company: company,
            forced_technician: @demo_technician_profile,
            financial_profile: :demo_technician
          )
          job_index += 1
          slot += 1
        end
      end

      accepted = Job.joins(:job_applications).where(
        job_applications: { technician_profile_id: @demo_technician_profile.id, status: :accepted }
      )
      @stats[:demo_technician_jobs] = accepted.distinct.count
      @stats[:demo_technician_jobs_from_demo_company] = accepted.where(company_profile_id: @demo_company_profile.id).distinct.count
    end

    def demo_technician_job_buckets
      target = DEMO_TECHNICIAN_JOBS_TARGET
      total_base = DEMO_TECHNICIAN_JOB_BUCKETS.sum { |bucket| bucket[:count] }
      buckets = DEMO_TECHNICIAN_JOB_BUCKETS.map do |bucket|
        share = ((bucket[:count].to_f / total_base) * target).round
        { key: bucket[:key], count: [share, 1].max }
      end
      diff = target - buckets.sum { |bucket| bucket[:count] }
      buckets[0][:count] += diff if diff.nonzero?
      buckets
    end

    def demo_company_job_buckets
      target = DEMO_COMPANY_JOBS_TARGET
      total_base = BASE_JOB_BUCKETS.sum { |bucket| bucket[:count] }
      buckets = BASE_JOB_BUCKETS.map do |bucket|
        share = ((bucket[:count].to_f / total_base) * target).round
        { key: bucket[:key], count: [share, 1].max }
      end
      diff = target - buckets.sum { |bucket| bucket[:count] }
      buckets[0][:count] += diff if diff.nonzero?
      buckets
    end

    def create_job_for_bucket!(market_key:, bucket:, index:, companies:, techs:, forced_company: nil, forced_technician: nil, financial_profile: nil)
      market = MARKETS[market_key]
      company = forced_company || pick_company_for_job(market_key, index, companies)
      neighborhood = market[:neighborhoods][index % market[:neighborhoods].size].gsub("\\", "")
      skill = SKILL_CLASSES[index % SKILL_CLASSES.size]
      titles = JOB_TITLES[skill]
      title = titles[index % titles.size]
      is_flagship = forced_company.nil? && market_key == :houston && bucket == :claimed && index == open_jobs_per_city
      if is_flagship
        title = "URGENT: Commercial RTU coverage — Midtown Houston"
        skill = "HVAC"
      end
      hourly = 4500 + (index % 8) * 500 + (skill == "Electrical" ? 800 : 0)
      hourly = 7200 if is_flagship
      days = 1 + (index % 3)
      hours = 6 + (index % 3)
      hourly, days, hours = apply_demo_financial_profile(
        hourly: hourly,
        days: days,
        hours: hours,
        profile: financial_profile,
        index: index
      )

      lat_offset = BigDecimal((((index % 9) - 4) * 0.015).to_s)
      lng_offset = BigDecimal((((index % 11) - 5) * 0.015).to_s)
      job_lat = market[:lat] + lat_offset
      job_lng = market[:lng] + lng_offset

      now = Time.current
      start_at, end_at, status = schedule_for_bucket(bucket, now)

      description = if is_flagship
                      <<~DESC.strip
                        Bayou City Mechanical lost a tech on a 40-ton rooftop unit in Midtown. Need EPA-certified HVAC
                        coverage starting tomorrow, 8 hrs/day for 2 days. $72/hr — tools provided on site.
                        Gate access through TechFlash messages after claim.
                      DESC
                    else
                      <<~DESC.strip
                        #{company.company_name} needs a #{skill.downcase} tech in #{neighborhood}, #{market[:city]}.
                        Short-term coverage: #{days} day(s), #{hours} hrs/day. Bring standard PPE; steel-toe required on site.
                        Contact on file; coordinate arrival through TechFlash messages.
                      DESC
                    end

      notes = if is_flagship
                "Demo showcase job. FLAGSHIP_DEMO_JOB"
              else
                "Tools: standard #{skill} kit. Safety: PPE required. License: #{skill == 'Electrical' ? 'TX journeyman or higher' : 'trade-appropriate'}."
              end

      job = Job.create!(
        company_profile: company,
        title: title,
        description: description,
        notes: notes,
        status: :open,
        skill_class: skill,
        location: "#{neighborhood}, #{market[:city]}",
        address: "#{100 + index} Commerce St",
        city: market[:city],
        state: market[:state],
        zip_code: format("%05d", 77_001 + index),
        country: "United States",
        hourly_rate_cents: hourly,
        hours_per_day: hours,
        days: days,
        minimum_years_experience: index % 4,
        required_certifications: skill == "Electrical" ? "Texas electrical license" : nil,
        scheduled_start_at: start_at,
        scheduled_end_at: end_at,
        go_live_at: 48.hours.ago
      )
      job.update_columns(latitude: job_lat, longitude: job_lng, status: Job.statuses[:open])

      tech = forced_technician || techs[index % techs.size]

      case bucket
      when :open
        job.update_columns(status: Job.statuses[:open])
        if index == 1
          job.update_columns(scheduled_end_at: 2.days.ago)
        end
      when :claimed, :in_progress
        job.update_columns(status: Job.statuses[:filled])
        JobApplication.create!(job: job, technician_profile: tech, status: :accepted)
        Payment.create!(
          job: job,
          amount_cents: job.tech_payout_cents,
          status: "held",
          stripe_payment_intent_id: "pi_demo_#{job.id}",
          held_at: now - 1.day
        )
        @stats[:payments] += 1
        seed_conversation!(job, company, tech)
      when :pending_review, :reviewed
        job.update_columns(status: Job.statuses[:finished], finished_at: now - 2.days)
        JobApplication.create!(job: job, technician_profile: tech, status: :accepted)
        Payment.create!(
          job: job,
          amount_cents: job.tech_payout_cents,
          status: bucket == :reviewed ? "released" : "held",
          stripe_payment_intent_id: "pi_demo_#{job.id}",
          held_at: now - 5.days,
          released_at: (bucket == :reviewed ? now - 1.day : nil),
          stripe_transfer_id: (bucket == :reviewed ? "tr_demo_#{job.id}" : nil)
        )
        @stats[:payments] += 1
        seed_conversation!(job, company, tech, richer: true)
        if bucket == :reviewed
          seed_bilateral_reviews!(job, company, tech)
          @reviewed_demo_job_id ||= job.id if market_key == :houston && forced_technician == @demo_technician_profile
        end
      end

      @flagship_jobs[market_key] = job if is_flagship
      @stats[:jobs] += 1
      seed_notifications_for_job!(job, company, tech, bucket)
    end

    def schedule_for_bucket(bucket, now)
      case bucket
      when :open
        [now + 2.days, now + 5.days, :open]
      when :claimed
        [now + 3.days, now + 6.days, :filled]
      when :in_progress
        [now - 1.day, now + 2.days, :filled]
      when :pending_review, :reviewed
        [now - 5.days, now - 1.day, :finished]
      else
        [now + 1.day, now + 4.days, :open]
      end
    end

    def apply_demo_financial_profile(hourly:, days:, hours:, profile:, index:)
      return [hourly, days, hours] if profile.blank?

      boosted_hourly = (BigDecimal(hourly.to_s) * DEMO_FINANCIAL_MULTIPLIER).to_i + DEMO_FINANCIAL_BASE_BOOST_CENTS
      boosted_hourly += ((index % 6) * 350)
      boosted_days = [days + 1 + (index % 2), 5].min
      boosted_hours = [hours + 2, 12].min
      [boosted_hourly, boosted_days, boosted_hours]
    end

    def seed_conversation!(job, company, tech, richer: false)
      conv = Conversation.create!(
        job: job,
        company_profile: company,
        technician_profile: tech,
        conversation_type: Conversation::TYPE_JOB
      )
      company_user = company.user
      tech_user = tech.user
      msgs = richer ? rich_messages(job) : basic_messages(job)
      msgs.each_with_index do |(sender, body), i|
        Message.create!(
          conversation: conv,
          sender: sender,
          content: body,
          created_at: i.hours.ago
        )
        @stats[:messages] += 1
      end
    end

    def basic_messages(job)
      co = job.company_profile
      tech = job.job_applications.first&.technician_profile
      return [] unless co && tech

      [
        [co, "Hi — confirming you can make the #{job.city} site tomorrow?"],
        [tech, "Yes, I'll be on site by 7:30 AM with tools. Any gate code?"],
        [co, "Gate code 4521. Park on the north lot. Thanks!"]
      ]
    end

    def rich_messages(job)
      tech = job.job_applications.first&.technician_profile
      basic_messages(job) + [
        [job.company_profile, "Please send photos when the unit is isolated."],
        [tech, "Will do — ETA 20 minutes."]
      ]
    end

    def seed_bilateral_reviews!(job, company, tech)
      company_scores = Rating::COMPANY_REVIEW_CATEGORIES.keys.index_with { 4 + (job.id % 2) }
      tech_scores = Rating::TECH_REVIEW_CATEGORIES.keys.index_with { 5 }

      Rating.create!(
        {
          job: job,
          reviewer: company,
          reviewee: tech,
          score: 5,
          comment: "Professional, dependable, safe on site, and left the work area clean. Strong communication throughout the shift.",
          category_scores: company_scores.transform_keys(&:to_s)
        }.merge(company_marketplace_review_attrs)
      )
      Rating.create!(
        {
          job: job,
          reviewer: tech,
          reviewee: company,
          score: 5.0,
          comment: "Clear scope, professional site lead, accurate job posting, and payment expectations were communicated clearly.",
          category_scores: tech_scores.transform_keys(&:to_s)
        }.merge(technician_marketplace_review_attrs)
      )
      @stats[:ratings] += 2
    end

    def company_marketplace_review_attrs
      return {} unless Rating.column_names.include?("would_hire_again")

      {
        would_hire_again: true,
        would_recommend: true,
        on_time_status: :on_time,
        request_again: true
      }
    end

    def technician_marketplace_review_attrs
      return {} unless Rating.column_names.include?("would_work_again")

      {
        would_work_again: true,
        payment_on_time: true,
        job_description_match: :yes
      }
    end

    def seed_notifications_for_job!(job, company, tech, bucket)
      return if bucket == :open

      AppNotification.create!(
        user: company.user,
        category: "job_lifecycle",
        title: "Technician assigned",
        body: "A technician claimed #{job.title} in #{job.city}.",
        metadata: { job_id: job.id }
      )
      AppNotification.create!(
        user: tech.user,
        category: "messages",
        title: "New message on #{job.title}",
        body: "The company sent a message about schedule details.",
        metadata: { job_id: job.id }
      )
    end

    def seed_login_events!
      per_user = @stats[:users].to_i > 250 ? 2 : rand(3..8)
      User.find_each do |u|
        per_user.times do |d|
          UserLoginEvent.create!(user_id: u.id, via_masquerade: false, created_at: d.days.ago + rand(0..3600).seconds)
        end
      end
    end

    def seed_demo_admin_notifications!
      admin = @demo_users[:admin]
      return unless admin

      [
        ["job_lifecycle", "Marketplace activity", "#{@stats[:jobs]} jobs across Houston, Austin, and Dallas."],
        ["messages", "Message threads active", "#{@stats[:messages]} messages on claimed and completed jobs."],
        ["reviews", "Reviews pending", "#{@stats[:ratings] / 2} completed jobs with bilateral reviews."]
      ].each do |category, title, body|
        AppNotification.create!(user: admin, category: category, title: title, body: body, metadata: {})
      end
    end

    def seed_demo_feedback!
      company_user = @demo_users[:company]
      tech_user = @demo_users[:technician]
      return unless company_user && tech_user

      FeedbackSubmission.create!(
        user: tech_user,
        kind: "suggestion",
        body: "Push alerts for new HVAC jobs within 25 miles would help me respond faster on urgent callouts.",
        page_path: "/jobs"
      )
      FeedbackSubmission.create!(
        user: company_user,
        kind: "suggestion",
        body: "Bulk messaging for confirmed technicians would speed up dispatch on multi-day commercial jobs.",
        page_path: "/messages"
      )
    end

    def attach_flagship_to_stats!
      flagship = @flagship_jobs[:houston]
      @stats[:flagship_job_id] = flagship&.id
      @stats[:reviewed_job_id] = @reviewed_demo_job_id
      @stats[:demo_company_jobs] ||= @demo_company_profile&.jobs&.count.to_i
      if @demo_company_profile
        completed = @demo_company_profile.jobs.where(status: :finished)
        @stats[:demo_company_total_spent_cents] = completed.sum { |job| job.company_charge_cents.to_i }
      end
      if @demo_technician_profile
        accepted = Job.joins(:job_applications).where(
          job_applications: { technician_profile_id: @demo_technician_profile.id, status: :accepted }
        )
        @stats[:demo_technician_jobs] ||= accepted.distinct.count
        @stats[:demo_technician_jobs_from_demo_company] ||= accepted.where(
          company_profile_id: @demo_company_profile&.id
        ).distinct.count
        released = Payment.joins(:job)
          .joins("INNER JOIN job_applications ON job_applications.job_id = jobs.id")
          .where(job_applications: { technician_profile_id: @demo_technician_profile.id, status: :accepted })
          .where(payments: { status: "released" })
          .sum(:amount_cents)
        held = Payment.joins(:job)
          .joins("INNER JOIN job_applications ON job_applications.job_id = jobs.id")
          .where(job_applications: { technician_profile_id: @demo_technician_profile.id, status: :accepted })
          .where(payments: { status: "held" })
          .sum(:amount_cents)
        @stats[:demo_technician_released_cents] = released
        @stats[:demo_technician_pending_cents] = held
      end
    end

    def pick_company_for_job(market_key, index, companies)
      if market_key == :houston && @demo_company_profile
        open = open_jobs_per_city
        demo_slots = [0, 1, 2, open, open + 1, open + 2]
        return @demo_company_profile if demo_slots.include?(index)
      end

      companies[index % companies.size]
    end

    def upsert_user!(email, role, first_name, last_name, phone:)
      user = User.find_or_initialize_by(email: email.downcase)
      was_new = user.new_record?
      user.assign_attributes(
        password: DEMO_PASSWORD,
        password_confirmation: DEMO_PASSWORD,
        role: role,
        first_name: first_name,
        last_name: last_name,
        phone: phone
      )
      user.save!
      @stats[:users] += 1 if was_new
      user
    end
  end
end
