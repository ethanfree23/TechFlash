/** Constants and helpers for Technician Activation CRM (admin users). */

export const ACTIVATION_STATUSES = [
  'new',
  'contacting',
  'engaged',
  'onboarding',
  'ready',
  'available',
  'placed',
  'nurture',
  'unresponsive',
  'disqualified',
];

export const ACTIVATION_STATUS_LABELS = {
  new: 'New',
  contacting: 'Contacting',
  engaged: 'Engaged',
  onboarding: 'Onboarding',
  ready: 'Ready',
  available: 'Available',
  placed: 'Placed',
  nurture: 'Nurture',
  unresponsive: 'Unresponsive',
  disqualified: 'Disqualified',
};

export const ACTIVATION_STATUS_COLORS = {
  new: 'bg-slate-100 text-slate-700 border-slate-200',
  contacting: 'bg-sky-50 text-sky-800 border-sky-200',
  engaged: 'bg-blue-50 text-blue-800 border-blue-200',
  onboarding: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  ready: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  available: 'bg-green-50 text-green-800 border-green-200',
  placed: 'bg-teal-50 text-teal-900 border-teal-200',
  nurture: 'bg-amber-50 text-amber-900 border-amber-200',
  unresponsive: 'bg-orange-50 text-orange-900 border-orange-200',
  disqualified: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const CALL_OUTCOMES = [
  { id: 'connected', label: 'Connected' },
  { id: 'left_voicemail', label: 'vm / texted' },
  { id: 'no_answer', label: 'No answer' },
  { id: 'requested_callback', label: 'Requested callback' },
  { id: 'wrong_number', label: 'Wrong/disconnected' },
  { id: 'not_interested', label: 'Not interested' },
];

export const CALL_OUTCOME_LABELS = Object.fromEntries(CALL_OUTCOMES.map((o) => [o.id, o.label]));

export const AVAILABILITIES = [
  { id: 'unknown', label: 'Unknown' },
  { id: 'available_now', label: 'Available now' },
  { id: 'available_soon', label: 'Available soon' },
  { id: 'not_available', label: 'Not available' },
  { id: 'has_a_job', label: 'Has a job' },
];

export const AVAILABILITY_LABELS = Object.fromEntries(AVAILABILITIES.map((a) => [a.id, a.label]));

export const ACTIVATION_PIPELINE_TABS = [
  { id: 'never_contacted', label: 'Never contacted', scope: 'never_contacted' },
  { id: 'due_today', label: 'Follow-ups today', scope: 'due_today' },
  { id: 'overdue', label: 'Overdue', scope: 'overdue' },
  { id: 'awaiting_response', label: 'Awaiting response', scope: 'awaiting_response' },
  { id: 'onboarding_incomplete', label: 'Onboarding incomplete', scope: 'onboarding_incomplete' },
  { id: 'ready_available', label: 'Ready / available', scope: 'ready_available' },
  { id: 'has_a_job', label: 'Has a job', scope: 'has_a_job' },
  { id: 'unresponsive', label: 'Unresponsive', scope: 'unresponsive' },
];

export const NOTES_KEY_PREFIX = 'admin_user_notes_';
export const NOTES_MIGRATED_PREFIX = 'admin_user_notes_migrated_';

export function loadLocalNotes(userId) {
  try {
    return JSON.parse(localStorage.getItem(`${NOTES_KEY_PREFIX}${userId}`) || '[]');
  } catch {
    return [];
  }
}

export function clearLocalNotes(userId) {
  localStorage.removeItem(`${NOTES_KEY_PREFIX}${userId}`);
  localStorage.setItem(`${NOTES_MIGRATED_PREFIX}${userId}`, '1');
}

export function localNotesAlreadyMigrated(userId) {
  return localStorage.getItem(`${NOTES_MIGRATED_PREFIX}${userId}`) === '1';
}

export function activationStatusLabel(status) {
  return ACTIVATION_STATUS_LABELS[status] || status || 'New';
}

export function callOutcomeLabel(outcome) {
  return CALL_OUTCOME_LABELS[outcome] || outcome || '—';
}

export function availabilityLabel(value) {
  return AVAILABILITY_LABELS[value] || value || 'Unknown';
}

export function interactionTypeLabel(type) {
  const map = {
    note: 'Note',
    call: 'Call',
    voicemail: 'Voicemail',
    sms: 'SMS',
    email: 'Email',
    follow_up: 'Follow-up',
    status_change: 'Status',
  };
  return map[type] || type || 'Note';
}

export function formatDateTimeLocalValue(isoOrDate) {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultFollowUpLocalValue(hoursFromNow = 24) {
  return formatDateTimeLocalValue(new Date(Date.now() + hoursFromNow * 60 * 60 * 1000));
}

export function newClientKey(prefix = 'ui') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function blockersSummary(activation) {
  const labels = activation?.onboarding_blockers || activation?.onboarding?.blocker_labels || [];
  if (!labels.length) return '';
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

export function applyActivationPipelineFilter(enriched, pipelineId) {
  if (!pipelineId) return enriched;
  const techs = enriched.filter((u) => u.role === 'technician');
  switch (pipelineId) {
    case 'never_contacted':
      return techs.filter((u) => !u.activation?.last_contacted_at);
    case 'due_today': {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return techs.filter((u) => {
        const due = u.activation?.next_follow_up_at;
        if (!due) return false;
        const t = new Date(due).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
    }
    case 'overdue':
      return techs.filter((u) => {
        const due = u.activation?.next_follow_up_at;
        return due && new Date(due).getTime() < Date.now();
      });
    case 'awaiting_response':
      return techs.filter((u) =>
        ['left_voicemail', 'no_answer', 'requested_callback'].includes(u.activation?.last_call_outcome)
        && !['disqualified', 'placed'].includes(u.activation?.status)
      );
    case 'onboarding_incomplete':
      return techs.filter((u) =>
        ['engaged', 'onboarding', 'ready', 'contacting'].includes(u.activation?.status || 'new')
        && u.activation?.onboarding_complete === false
      );
    case 'ready_available':
      return techs.filter((u) => ['ready', 'available'].includes(u.activation?.status));
    case 'has_a_job':
      return techs.filter((u) => u.activation?.current_availability === 'has_a_job');
    case 'unresponsive':
      return techs.filter((u) => u.activation?.status === 'unresponsive');
    default:
      return techs;
  }
}
