/**
 * Helpers for the `schedule_availability` payload the API attaches to a job for the
 * viewing technician, and for the alternate-schedule options inside it.
 *
 * All the date arithmetic is done server-side. These helpers only read and phrase it, so
 * the browser can never disagree with the backend about what a technician can work.
 */

export const AVAILABLE = 'available';
export const SCHEDULE_CONFLICT = 'schedule_conflict';
export const UNAVAILABLE = 'unavailable';

export const getScheduleAvailability = (job) => job?.schedule_availability || null;

export const getClassification = (job) => getScheduleAvailability(job)?.classification || null;

export const hasScheduleConflict = (job) => getClassification(job) === SCHEDULE_CONFLICT;

export const isScheduleUnavailable = (job) => getClassification(job) === UNAVAILABLE;

export const getScheduleOptions = (job) => {
  const options = getScheduleAvailability(job)?.options;
  return Array.isArray(options) ? options : [];
};

const UNAVAILABLE_REASONS = {
  existing_assignment_schedule_unknown:
    'One of the jobs you have already claimed has no confirmed schedule, so TechFlash '
    + 'cannot work out whether this one fits.',
  no_alternate_schedule_fits:
    'This job overlaps work you have already claimed, and its end date leaves no days you '
    + 'could still work.',
};

export const unavailableReasonText = (job) => {
  const reason = getScheduleAvailability(job)?.reason;
  return UNAVAILABLE_REASONS[reason] || null;
};

export const SCHEDULE_OPTION_TITLES = {
  start_after_conflict: 'Start after your current job',
  keep_original_end: 'Keep the original end date and work the remaining days',
};

/**
 * Accepts either an alternate-schedule option (which names the choice `kind`) or a stored
 * counter-offer proposal (which names it `option`).
 */
export const scheduleOptionTitle = (option) =>
  SCHEDULE_OPTION_TITLES[option?.kind ?? option?.option] || 'Alternate schedule';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Formats a plain `YYYY-MM-DD` working date without shifting it into the local zone. */
export const formatWorkingDate = (value) => {
  if (!value) return '';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return dateFormatter.format(new Date(y, m - 1, d));
};

export const formatScheduleMoment = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : dateTimeFormatter.format(parsed);
};

/** One-line plain-English summary of what an option commits the technician to. */
export const describeScheduleOption = (option) => {
  if (!option) return '';
  const start = formatScheduleMoment(option.start_at);
  const end = formatScheduleMoment(option.end_at);
  const days = option.days;
  const requested = option.requested_days;

  if (option.full_duration) {
    return `Work all ${days} day${days === 1 ? '' : 's'} the company asked for, ${start} through ${end}.`;
  }
  const missing = Math.max(0, Number(requested || 0) - Number(days || 0));
  return `Work ${days} of the ${requested} requested day${requested === 1 ? '' : 's'}, `
    + `${start} through ${end}${missing > 0 ? `, leaving ${missing} day${missing === 1 ? '' : 's'} uncovered` : ''}.`;
};

/** Reads the conflict payload out of a failed claim response. */
export const scheduleConflictFromError = (err) => {
  const details = err?.details;
  if (!details?.schedule_conflict) return null;
  return {
    message: details.error || 'This job overlaps a job you have already claimed.',
    ...(details.schedule_conflict_details || {}),
    options: Array.isArray(details.schedule_conflict_details?.options)
      ? details.schedule_conflict_details.options
      : [],
  };
};
