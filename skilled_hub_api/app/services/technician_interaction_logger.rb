# frozen_string_literal: true

class TechnicianInteractionLogger
  Result = Struct.new(:ok, :interaction, :follow_up, :activation, :onboarding, :errors, :http_status, keyword_init: true)

  def self.create!(user:, admin:, params:)
    new(user: user, admin: admin, params: params).create!
  end

  def self.log_call!(user:, admin:, params:)
    attrs = params.to_h.symbolize_keys
    attrs[:interaction_type] = attrs[:outcome].to_s == "left_voicemail" ? "voicemail" : "call"
    create!(user: user, admin: admin, params: attrs)
  end

  def self.import_local!(user:, admin:, notes:)
    new(user: user, admin: admin, params: {}).import_local!(notes)
  end

  def initialize(user:, admin:, params:)
    @user = user
    @admin = admin
    @params = params.to_h.deep_symbolize_keys
  end

  def create!
    return failure("User not found", :not_found) unless @user
    return failure("User must be a technician", :unprocessable_entity) unless @user.technician?
    return failure("Admin required", :forbidden) unless @admin&.admin?

    if @params[:client_key].present?
      existing = TechnicianInteraction.find_by(user_id: @user.id, client_key: @params[:client_key].to_s.strip)
      if existing
        activation = TechnicianActivation.ensure_for!(@user)
        return success(existing, nil, activation)
      end
    end

    activation = TechnicianActivation.ensure_for!(@user)
    interaction = build_interaction

    ActiveRecord::Base.transaction do
      unless interaction.save
        return failure(interaction.errors.full_messages, :unprocessable_entity)
      end

      follow_up = maybe_create_follow_up!(interaction)
      maybe_auto_status!(activation, interaction)
      activation.record_contact!(interaction: interaction) if contact_event?(interaction)
      activation.refresh_follow_up_cache!

      success(interaction, follow_up, activation.reload)
    end
  rescue ArgumentError => e
    failure(e.message, :unprocessable_entity)
  end

  def import_local!(notes)
    return failure("User must be a technician", :unprocessable_entity) unless @user&.technician?
    return failure("Admin required", :forbidden) unless @admin&.admin?

    imported = []
    skipped = 0
    errors = []

    Array(notes).each do |raw|
      note = raw.to_h.deep_symbolize_keys
      local_id = note[:local_id].presence || note[:id]
      body = note[:body].to_s.strip
      if body.blank?
        skipped += 1
        next
      end

      client_key = "local:#{local_id.presence || Digest::SHA256.hexdigest(body)[0, 16]}"
      if TechnicianInteraction.exists?(user_id: @user.id, client_key: client_key)
        skipped += 1
        next
      end

      occurred_at = parse_time(note[:at] || note[:occurred_at]) || Time.current
      result = self.class.create!(
        user: @user,
        admin: @admin,
        params: {
          interaction_type: "note",
          body: body,
          occurred_at: occurred_at,
          client_key: client_key,
          metadata: {
            migrated_from_local: true,
            local_id: local_id,
            local_admin_label: note[:admin]
          }
        }
      )
      if result.ok
        imported << result.interaction
      else
        errors.concat(Array(result.errors))
      end
    end

    activation = TechnicianActivation.ensure_for!(@user)
    Result.new(
      ok: errors.empty?,
      interaction: nil,
      follow_up: nil,
      activation: activation,
      onboarding: TechnicianOnboardingReadiness.call(@user, activation: activation),
      errors: errors.presence,
      http_status: errors.empty? ? :ok : :unprocessable_entity
    ).tap do |res|
      res.define_singleton_method(:imported_count) { imported.size }
      res.define_singleton_method(:skipped_count) { skipped }
      res.define_singleton_method(:interactions) do
        imported.map { |i| TechnicianActivationSerializer.interaction_payload(i) }
      end
    end
  end

  private

  def build_interaction
    type = @params[:interaction_type].to_s.strip.presence || "note"
    outcome = @params[:outcome].to_s.strip.presence
    type = "voicemail" if type == "call" && outcome == "left_voicemail"

    TechnicianInteraction.new(
      user: @user,
      author: @admin,
      interaction_type: type,
      outcome: outcome,
      body: @params[:body],
      follow_up_at: parse_time(@params[:follow_up_at]),
      occurred_at: parse_time(@params[:occurred_at]) || Time.current,
      client_key: @params[:client_key],
      metadata: (@params[:metadata].presence || {}).to_h
    )
  end

  def maybe_create_follow_up!(interaction)
    due = parse_time(@params[:follow_up_at] || @params[:next_follow_up_at])
    return nil unless due

    TechnicianFollowUp.create!(
      user: @user,
      assigned_admin: @admin,
      created_by: @admin,
      due_at: due,
      status: "open",
      description: @params[:follow_up_description].presence || default_follow_up_description(interaction),
      technician_interaction: interaction
    )
  end

  def default_follow_up_description(interaction)
    case interaction.interaction_type
    when "call", "voicemail"
      "Follow up after call (#{interaction.outcome || 'logged'})"
    else
      "Scheduled follow-up"
    end
  end

  def maybe_auto_status!(activation, interaction)
    return if @params[:skip_auto_status]

    suggestion =
      case interaction.outcome
      when "connected", "requested_callback" then "engaged"
      when "left_voicemail", "no_answer" then activation.status == "new" ? "contacting" : nil
      when "not_interested", "wrong_number" then "disqualified"
      else
        nil
      end

    return unless suggestion
    return if activation.status == suggestion
    return if %w[ready available placed].include?(activation.status)

    previous = activation.apply_status!(suggestion, admin: @admin)
    TechnicianInteraction.create!(
      user: @user,
      author: @admin,
      interaction_type: "status_change",
      body: "Status auto-updated after #{interaction.interaction_type}",
      occurred_at: Time.current,
      metadata: {
        previous_status: previous,
        new_status: suggestion,
        auto: true,
        source_interaction_id: interaction.id
      }
    )
  end

  def contact_event?(interaction)
    interaction.interaction_type.in?(%w[call voicemail sms email note]) &&
      interaction.interaction_type != "status_change"
  end

  def parse_time(value)
    return value if value.is_a?(Time) || value.is_a?(ActiveSupport::TimeWithZone) || value.is_a?(DateTime)
    return nil if value.blank?

    Time.zone.parse(value.to_s)
  rescue ArgumentError, TypeError
    nil
  end

  def success(interaction, follow_up, activation)
    Result.new(
      ok: true,
      interaction: interaction,
      follow_up: follow_up,
      activation: activation,
      onboarding: TechnicianOnboardingReadiness.call(@user, activation: activation),
      errors: nil,
      http_status: :created
    )
  end

  def failure(errors, status)
    Result.new(
      ok: false,
      interaction: nil,
      follow_up: nil,
      activation: nil,
      onboarding: nil,
      errors: Array(errors),
      http_status: status
    )
  end
end
