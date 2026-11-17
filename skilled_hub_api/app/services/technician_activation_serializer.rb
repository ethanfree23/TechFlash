# frozen_string_literal: true

class TechnicianActivationSerializer
  def self.activation_payload(activation, onboarding: nil)
    return nil unless activation

    {
      status: activation.status,
      last_contacted_at: activation.last_contacted_at&.iso8601,
      last_interaction_type: activation.last_interaction_type,
      last_call_outcome: activation.last_call_outcome,
      next_follow_up_at: activation.next_follow_up_at&.iso8601,
      current_availability: activation.current_availability,
      status_updated_at: activation.status_updated_at&.iso8601,
      status_updated_by_id: activation.status_updated_by_id,
      suggested_transitions: TechnicianActivation::SUGGESTED_TRANSITIONS[activation.status] || [],
      onboarding: onboarding
    }
  end

  def self.interaction_payload(interaction)
    {
      id: interaction.id,
      user_id: interaction.user_id,
      author_id: interaction.author_id,
      author_name: author_name(interaction.author),
      interaction_type: interaction.interaction_type,
      outcome: interaction.outcome,
      body: interaction.body,
      follow_up_at: interaction.follow_up_at&.iso8601,
      occurred_at: interaction.occurred_at&.iso8601,
      client_key: interaction.client_key,
      metadata: interaction.metadata || {},
      created_at: interaction.created_at&.iso8601,
      updated_at: interaction.updated_at&.iso8601
    }
  end

  def self.follow_up_payload(follow_up)
    {
      id: follow_up.id,
      user_id: follow_up.user_id,
      assigned_admin_id: follow_up.assigned_admin_id,
      assigned_admin_name: author_name(follow_up.assigned_admin),
      created_by_id: follow_up.created_by_id,
      due_at: follow_up.due_at&.iso8601,
      status: follow_up.status,
      description: follow_up.description,
      completed_at: follow_up.completed_at&.iso8601,
      technician_interaction_id: follow_up.technician_interaction_id,
      created_at: follow_up.created_at&.iso8601,
      updated_at: follow_up.updated_at&.iso8601,
      technician_name: technician_name(follow_up.user),
      technician_email: follow_up.user&.email,
      technician_phone: follow_up.user&.phone.presence || follow_up.user&.technician_profile&.phone
    }
  end

  def self.author_name(user)
    return nil unless user

    name = [user.first_name, user.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ")
    name.presence || user.email
  end

  def self.technician_name(user)
    return nil unless user

    name = [user.first_name, user.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ")
    name.presence || user.email
  end
end
