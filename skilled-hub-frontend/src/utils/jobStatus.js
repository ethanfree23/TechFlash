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
