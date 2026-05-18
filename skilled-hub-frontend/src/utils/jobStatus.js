/** Matches `Job` enum order in Rails (`app/models/job.rb`). */
export const JOB_STATUS_KEYS = ['open', 'reserved', 'accepted', 'completed', 'filled', 'finished'];

const LABELS = {
  open: 'Open',
  reserved: 'Reserved',
  accepted: 'Accepted',
  completed: 'Completed',
  filled: 'Filled',
  finished: 'Finished',
};

export const jobStatusLabel = (key) => LABELS[key] || key;

/**
 * @param {unknown} source - job object or raw status from API (string or legacy integer / null).
 * @returns {string} one of JOB_STATUS_KEYS; defaults to `open` when unknown.
 */
export function normalizeJobStatusKey(source) {
  const raw = source && typeof source === 'object' && !Array.isArray(source) ? source.status : source;
  if (raw === null || raw === undefined || raw === '') return 'open';
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < JOB_STATUS_KEYS.length) {
    return JOB_STATUS_KEYS[raw];
  }
  const s = String(raw).toLowerCase();
  if (JOB_STATUS_KEYS.includes(s)) return s;
  return 'open';
}

/** @typedef {'blue'|'green'|'orange'|'gray'|'yellow'|'red'} JobStatusTone */

/**
 * User-facing display status for job cards and badges.
 * @returns {{ key: string, label: string, tone: JobStatusTone, hasCounterPending: boolean }}
 */
export function getJobDisplayStatus(job) {
  const status = normalizeJobStatusKey(job);
  const hasCounterPending = Boolean(job?.pending_counter_offer);
  const now = Date.now();
  const endAt = job?.scheduled_end_at ? new Date(job.scheduled_end_at).getTime() : null;
  const startAt = job?.scheduled_start_at ? new Date(job.scheduled_start_at).getTime() : null;

  if (status === 'open') {
    if (endAt !== null && endAt < now) {
      return { key: 'expired', label: 'Expired', tone: 'gray', hasCounterPending };
    }
    return { key: 'open', label: 'Open', tone: 'blue', hasCounterPending };
  }
  if (status === 'finished' || status === 'completed') {
    return { key: 'completed', label: 'Completed', tone: 'green', hasCounterPending };
  }
  if (status === 'reserved' || status === 'filled' || status === 'accepted') {
    if (startAt !== null && startAt <= now) {
      return { key: 'active', label: 'Active', tone: 'green', hasCounterPending };
    }
    return { key: 'claimed', label: 'Claimed', tone: 'yellow', hasCounterPending };
  }
  return { key: status, label: jobStatusLabel(status), tone: 'gray', hasCounterPending };
}

export const STATUS_BADGE_CLASSES = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200/80',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  orange: 'bg-orange-50 text-orange-800 border-orange-200/80',
  gray: 'bg-slate-100 text-slate-600 border-slate-200/80',
  yellow: 'bg-amber-50 text-amber-800 border-amber-200/80',
  red: 'bg-red-50 text-red-800 border-red-200/80',
};

/** Subtle card accent — left border + optional ring for counter-pending */
export const CARD_ACCENT_CLASSES = {
  open: 'border-l-[3px] border-l-blue-500',
  expired: 'border-l-[3px] border-l-slate-400',
  claimed: 'border-l-[3px] border-l-amber-500',
  active: 'border-l-[3px] border-l-emerald-600',
  completed: 'border-l-[3px] border-l-emerald-400',
  default: 'border-l-[3px] border-l-slate-200',
};

export function getCardSurfaceClasses(job) {
  const display = getJobDisplayStatus(job);
  const accent = CARD_ACCENT_CLASSES[display.key] || CARD_ACCENT_CLASSES.default;
  const counterRing = display.hasCounterPending ? ' ring-1 ring-orange-200/90 ring-inset' : '';
  const expiredMuted = display.key === 'expired' ? ' bg-slate-50/60' : ' bg-white';
  return `${accent}${counterRing}${expiredMuted}`;
}
