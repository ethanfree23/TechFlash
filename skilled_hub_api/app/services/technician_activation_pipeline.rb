# frozen_string_literal: true

class TechnicianActivationPipeline
  SCOPES = %w[
    due_today
    overdue
    never_contacted
    awaiting_response
    onboarding_incomplete
    ready_available
    unresponsive
  ].freeze

  def self.counts
    new.counts
  end

  def self.user_ids_for(scope)
    new.user_ids_for(scope)
  end

  def self.follow_ups_for(scope:, assigned_admin_id: nil)
    new.follow_ups_for(scope: scope, assigned_admin_id: assigned_admin_id)
  end

  def counts
    {
      due_today: TechnicianFollowUp.due_today.count,
      overdue: TechnicianFollowUp.overdue.count,
      never_contacted: never_contacted_scope.count,
      awaiting_response: awaiting_response_scope.count,
      onboarding_incomplete: onboarding_incomplete_user_ids.size,
      ready_available: TechnicianActivation.where(status: %w[ready available]).count,
      unresponsive: TechnicianActivation.where(status: "unresponsive").count,
      by_status: TechnicianActivation.group(:status).count
    }
  end

  def user_ids_for(scope)
    case scope.to_s
    when "due_today"
      TechnicianFollowUp.due_today.distinct.pluck(:user_id)
    when "overdue"
      TechnicianFollowUp.overdue.distinct.pluck(:user_id)
    when "never_contacted"
      never_contacted_scope.pluck(:id)
    when "awaiting_response"
      awaiting_response_scope.pluck(:user_id)
    when "onboarding_incomplete"
      onboarding_incomplete_user_ids
    when "ready_available"
      TechnicianActivation.where(status: %w[ready available]).pluck(:user_id)
    when "unresponsive"
      TechnicianActivation.where(status: "unresponsive").pluck(:user_id)
    else
      []
    end
  end

  def follow_ups_for(scope:, assigned_admin_id: nil)
    relation =
      case scope.to_s
      when "due_today" then TechnicianFollowUp.due_today
      when "overdue" then TechnicianFollowUp.overdue
      when "open", "", nil then TechnicianFollowUp.open_status
      else TechnicianFollowUp.open_status
      end

    relation = relation.where(assigned_admin_id: assigned_admin_id) if assigned_admin_id.present?
    relation.includes(:user, :assigned_admin, :created_by).order(:due_at, :id)
  end

  private

  def never_contacted_scope
    tech_ids = User.technician.left_outer_joins(:technician_activation).where(
      "technician_activations.id IS NULL OR technician_activations.last_contacted_at IS NULL"
    )
    tech_ids
  end

  def awaiting_response_scope
    TechnicianActivation.where(last_call_outcome: %w[left_voicemail no_answer requested_callback])
      .where.not(status: %w[disqualified placed])
  end

  def onboarding_incomplete_user_ids
    # Interested / in-pipeline but still blocked on verification or payout.
    candidates = TechnicianActivation.where(status: %w[engaged onboarding ready contacting]).includes(user: :technician_profile)
    inventories = TechnicianVerificationInventory.preload_for(candidates.map(&:user).compact)
    candidates.filter_map do |activation|
      user = activation.user
      next unless user&.technician?

      readiness = TechnicianOnboardingReadiness.call(user, inventory: inventories[user.id], activation: activation)
      user.id unless readiness[:complete]
    end
  end
end
