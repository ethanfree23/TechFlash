# frozen_string_literal: true

module PasswordSetup
  class Start
    START_EMAIL_LIMIT = 5
    START_EMAIL_WINDOW = 15.minutes
    START_IP_LIMIT = 20
    START_IP_WINDOW = 15.minutes

    NOT_ELIGIBLE_MESSAGE =
      "We couldn't verify that email for password setup. Make sure you're using the same email you used to sign up for TechFlash."
    ALREADY_SETUP_MESSAGE = "Your account is already set up."
    RATE_LIMITED_MESSAGE = "Too many attempts. Please try again later."
    MAIL_FAILED_MESSAGE = "Verification email could not be sent right now. Please try again shortly."

    def self.call(email:, ip:)
      new(email: email, ip: ip).call
    end

    def initialize(email:, ip:)
      @email = email.to_s.strip.downcase
      @ip = ip.to_s.presence || "unknown"
    end

    def call
      PasswordSetupChallenge.cleanup_stale!

      if @email.blank? || !@email.include?("@")
        return Result.new(
          http_status: :ok,
          body: { status: "not_eligible", error: NOT_ELIGIBLE_MESSAGE }
        )
      end

      ip_limit = AuthRateLimit.throttle!(
        scope: "password_setup_start_ip",
        bucket: @ip,
        limit: START_IP_LIMIT,
        window: START_IP_WINDOW
      )
      email_limit = AuthRateLimit.throttle!(
        scope: "password_setup_start_email",
        bucket: Digest::SHA256.hexdigest(@email),
        limit: START_EMAIL_LIMIT,
        window: START_EMAIL_WINDOW
      )

      if ip_limit[:limited] || email_limit[:limited]
        return Result.new(
          http_status: :too_many_requests,
          body: { status: "rate_limited", error: RATE_LIMITED_MESSAGE }
        )
      end

      user = User.find_by("LOWER(email) = ?", @email)

      if user.blank?
        return Result.new(
          http_status: :ok,
          body: { status: "not_eligible", error: NOT_ELIGIBLE_MESSAGE }
        )
      end

      if user.first_time_password_setup_eligible?
        return send_or_reuse_challenge!(user)
      end

      if user.technician? && user.password_already_established?
        return Result.new(
          http_status: :ok,
          body: { status: "already_setup", error: ALREADY_SETUP_MESSAGE }
        )
      end

      Result.new(
        http_status: :ok,
        body: { status: "not_eligible", error: NOT_ELIGIBLE_MESSAGE }
      )
    end

    private

    def send_or_reuse_challenge!(user)
      challenge = PasswordSetupChallenge.active.where(user_id: user.id).order(created_at: :desc).first

      if challenge&.resend_cooling_down?
        return code_sent_result(user, challenge)
      end

      code = PasswordSetupChallenge.generate_code

      delivery_result = MailDelivery.safe_deliver_result do
        UserMailer.password_setup_verification_code(user, code).deliver_now
      end

      unless delivery_result[:success]
        Rails.logger.error(
          "[password_setup_mail_failed] user_id=#{user.id} code=#{delivery_result[:code]} message=#{delivery_result[:error]}"
        )
        PasswordSetupChallenge.active.where(user_id: user.id, last_sent_at: nil).delete_all
        return Result.new(
          http_status: :service_unavailable,
          body: { status: "mail_failed", error: MAIL_FAILED_MESSAGE }
        )
      end

      challenge = build_or_rotate_challenge!(user, challenge, code)
      challenge.update!(last_sent_at: Time.current, request_ip: @ip)
      code_sent_result(user, challenge.reload)
    end

    def build_or_rotate_challenge!(user, challenge, code)
      if challenge
        challenge.assign_code!(code)
        challenge.request_ip = @ip
        challenge.save!
        challenge
      else
        record = PasswordSetupChallenge.new(user: user, request_ip: @ip)
        record.assign_code!(code)
        record.save!
        record
      end
    end

    def code_sent_result(user, challenge)
      Result.new(
        http_status: :ok,
        body: {
          status: "code_sent",
          challenge_id: challenge.public_id,
          masked_email: user.masked_email,
          resend_available_at: challenge.resend_available_at.iso8601
        }
      )
    end
  end
end
