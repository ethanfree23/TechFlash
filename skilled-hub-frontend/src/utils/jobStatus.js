/** Matches `Job` enum order in Rails (`app/models/job.rb`). */
export const JOB_STATUS_KEYS = ['open', 'reserved', 'accepted', 'completed', 'filled', 'finished', 'pending_funding'];

/** Canonical business lifecycle keys from `Job#effective_status`. */
export const EFFECTIVE_STATUS_KEYS = ['pending_funding', 'completed', 'active', 'claimed', 'expired', 'open'];

const LABELS = {
  open: 'Open',
  reserved: 'Reserved',
  accepted: 'Accepted',
  completed: 'Completed',
  filled: 'Filled',
  finished: 'Finished',
  pending_funding: 'Pending funding',
  expired: 'Expired',
  claimed: 'Claimed',
  active: 'Active',
};

const DISPLAY = {
  open: { label: 'Open', tone: 'blue' },
  expired: { label: 'Expired', tone: 'gray' },
  claimed: { label: 'Claimed', tone: 'yellow' },
  active: { label: 'Active', tone: 'green' },
  completed: { label: 'Completed', tone: 'green' },
  pending_funding: { label: 'Pending funding', tone: 'orange' },
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

/**
 * Canonical lifecycle key from the API. Does not re-derive expiration from dates.
 * @param {unknown} job
 * @returns {string}
 */
export function canonicalStatusKey(job) {
  if (job && typeof job === 'object' && !Array.isArray(job) && job.effective_status) {
    return String(job.effective_status).toLowerCase();
  }
  const persisted = normalizeJobStatusKey(job);
  if (persisted === 'finished' || persisted === 'completed') return 'completed';
  if (persisted === 'reserved' || persisted === 'filled' || persisted === 'accepted') return 'claimed';
  return persisted;
}

/** @typedef {'blue'|'green'|'orange'|'gray'|'yellow'|'red'} JobStatusTone */

/**
 * User-facing display status for job cards and badges.
 * Maps canonical effective_status to labels/colors only.
 * @returns {{ key: string, label: string, tone: JobStatusTone, hasCounterPending: boolean }}
 */
export function getJobDisplayStatus(job) {
  const key = canonicalStatusKey(job);
  const hasCounterPending = Boolean(job?.pending_counter_offer);
  const display = DISPLAY[key] || { label: jobStatusLabel(key), tone: 'gray' };
  return { key, label: display.label, tone: display.tone, hasCounterPending };
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
  pending_funding: 'border-l-[3px] border-l-orange-500',
  default: 'border-l-[3px] border-l-slate-200',
};

export function getCardSurfaceClasses(job) {
  const display = getJobDisplayStatus(job);
  const accent = CARD_ACCENT_CLASSES[display.key] || CARD_ACCENT_CLASSES.default;
  const counterRing = display.hasCounterPending ? ' ring-1 ring-orange-200/90 ring-inset' : '';
  const expiredMuted = display.key === 'expired' ? ' bg-slate-50/60' : ' bg-white';
  return `${accent}${counterRing}${expiredMuted}`;
}
