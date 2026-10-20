/**
 * Wall-clock datetime helpers for the DateTimeInput picker.
 * Values use the datetime-local shape: `YYYY-MM-DDTHH:mm` (no offset).
 * Job timezone is used only to compute "today / tomorrow / next Monday"
 * relative to the job site — never to shift an already-chosen wall time.
 */

const pad = (n) => String(n).padStart(2, '0');

export const DEFAULT_HOUR_12 = 8;
export const DEFAULT_MINUTE = 0;
export const DEFAULT_AMPM = 'AM';

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?/;

/**
 * @typedef {{ year: number, month: number, day: number, hour: number, minute: number, second?: number }} ZonedParts
 * @typedef {{ date: string, hour: number, minute: number, ampm: 'AM'|'PM' }} PickerParts
 */

/** @param {number} year @param {number} month 1-12 @param {number} day */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** @param {number} year @param {number} month 1-12 @param {number} day */
export function weekdayOf(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}

/** @param {number} year @param {number} month 1-12 @param {number} day @param {number} delta */
export function addDays(year, month, day, delta) {
  const d = new Date(year, month - 1, day + delta);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function formatDateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(date) {
  if (!date || typeof date !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function hour24To12(hour24) {
  const h = ((Number(hour24) % 24) + 24) % 24;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return { hour, ampm };
}

export function hour12To24(hour12, ampm) {
  let h = Number(hour12);
  if (!Number.isFinite(h)) h = DEFAULT_HOUR_12;
  h = Math.min(12, Math.max(1, Math.round(h)));
  if (ampm === 'PM') return h === 12 ? 12 : h + 12;
  return h === 12 ? 0 : h;
}

export function clampMinute(minute) {
  const n = Number(minute);
  if (!Number.isFinite(n)) return DEFAULT_MINUTE;
  return Math.min(59, Math.max(0, Math.round(n)));
}

export function clampHour12(hour) {
  const n = Number(hour);
  if (!Number.isFinite(n)) return DEFAULT_HOUR_12;
  return Math.min(12, Math.max(1, Math.round(n)));
}

/**
 * Parse a wall-clock datetime-local string without timezone conversion.
 * @param {string} val
 * @returns {PickerParts}
 */
export function parseWallDateTime(val) {
  if (!val) {
    return {
      date: '',
      hour: DEFAULT_HOUR_12,
      minute: DEFAULT_MINUTE,
      ampm: DEFAULT_AMPM,
    };
  }
  const m = DATETIME_RE.exec(String(val));
  if (m) {
    const hour24 = Number(m[4]);
    const { hour, ampm } = hour24To12(hour24);
    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      hour,
      minute: clampMinute(m[5]),
      ampm,
    };
  }
  // Fallback for ISO strings with offset — extract wall parts via Date only as last resort.
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) {
    return {
      date: '',
      hour: DEFAULT_HOUR_12,
      minute: DEFAULT_MINUTE,
      ampm: DEFAULT_AMPM,
    };
  }
  const { hour, ampm } = hour24To12(d.getHours());
  return {
    date: formatDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate()),
    hour,
    minute: d.getMinutes(),
    ampm,
  };
}

/**
 * Build a wall-clock datetime-local string.
 * @param {string} date YYYY-MM-DD
 * @param {number} hour12
 * @param {number} minute
 * @param {'AM'|'PM'} ampm
 */
export function buildWallDateTime(date, hour12, minute, ampm) {
  if (!date) return '';
  const h = hour12To24(hour12, ampm);
  return `${date}T${pad(h)}:${pad(clampMinute(minute))}`;
}

/**
 * Read calendar/clock parts for an instant in a given IANA timezone.
 * Falls back to the runtime local zone when timeZone is missing/invalid.
 * @param {Date} [instant]
 * @param {string} [timeZone]
 * @returns {ZonedParts}
 */
export function getZonedParts(instant = new Date(), timeZone) {
  const zone = timeZone && String(timeZone).trim() ? String(timeZone).trim() : undefined;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const bag = {};
    for (const part of fmt.formatToParts(instant)) {
      if (part.type !== 'literal') bag[part.type] = part.value;
    }
    return {
      year: Number(bag.year),
      month: Number(bag.month),
      day: Number(bag.day),
      hour: Number(bag.hour === '24' ? 0 : bag.hour),
      minute: Number(bag.minute),
      second: Number(bag.second || 0),
    };
  } catch {
    return {
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
      hour: instant.getHours(),
      minute: instant.getMinutes(),
      second: instant.getSeconds(),
    };
  }
}

/**
 * Default empty-field selection: tomorrow at 8:00 AM in the job timezone.
 * @param {Date} [now]
 * @param {string} [timeZone]
 */
export function defaultDraftParts(now = new Date(), timeZone) {
  const parts = getZonedParts(now, timeZone);
  const tomorrow = addDays(parts.year, parts.month, parts.day, 1);
  return {
    date: formatDateKey(tomorrow.year, tomorrow.month, tomorrow.day),
    hour: DEFAULT_HOUR_12,
    minute: DEFAULT_MINUTE,
    ampm: DEFAULT_AMPM,
  };
}

/**
 * Upcoming Monday relative to "today" in the job timezone.
 * If today is Monday, returns next week's Monday (+7).
 * @param {Date} [now]
 * @param {string} [timeZone]
 */
export function nextMondayDateKey(now = new Date(), timeZone) {
  const parts = getZonedParts(now, timeZone);
  const dow = weekdayOf(parts.year, parts.month, parts.day); // 0=Sun
  const daysUntil = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const target = addDays(parts.year, parts.month, parts.day, daysUntil);
  return formatDateKey(target.year, target.month, target.day);
}

/**
 * @param {number} offsetDays
 * @param {Date} [now]
 * @param {string} [timeZone]
 */
export function dateKeyFromOffset(offsetDays, now = new Date(), timeZone) {
  const parts = getZonedParts(now, timeZone);
  const target = addDays(parts.year, parts.month, parts.day, offsetDays);
  return formatDateKey(target.year, target.month, target.day);
}

export function todayDateKey(now = new Date(), timeZone) {
  return dateKeyFromOffset(0, now, timeZone);
}

/**
 * Quick-select helpers keep the current draft time unless none is set.
 * @param {'tomorrow'|'in_3_days'|'next_monday'} kind
 * @param {PickerParts} draft
 * @param {{ now?: Date, timeZone?: string }} [opts]
 */
export function applyQuickSelect(kind, draft, opts = {}) {
  const { now = new Date(), timeZone } = opts;
  let date;
  if (kind === 'tomorrow') date = dateKeyFromOffset(1, now, timeZone);
  else if (kind === 'in_3_days') date = dateKeyFromOffset(3, now, timeZone);
  else if (kind === 'next_monday') date = nextMondayDateKey(now, timeZone);
  else date = draft.date || defaultDraftParts(now, timeZone).date;

  return {
    date,
    hour: draft.hour || DEFAULT_HOUR_12,
    minute: Number.isFinite(draft.minute) ? clampMinute(draft.minute) : DEFAULT_MINUTE,
    ampm: draft.ampm === 'PM' ? 'PM' : 'AM',
  };
}

/**
 * Initial draft when opening the popover.
 * Empty value → tomorrow 8:00 AM (not committed until Apply).
 * Existing value → exact reopen.
 */
export function initialDraftFromValue(value, opts = {}) {
  const { now = new Date(), timeZone } = opts;
  if (value) {
    const parsed = parseWallDateTime(value);
    if (parsed.date) return parsed;
  }
  return defaultDraftParts(now, timeZone);
}

/**
 * Compare wall-clock date keys (YYYY-MM-DD). Negative if a < b.
 */
export function compareDateKeys(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Whether a wall date is before "today" in the given timezone.
 */
export function isDateBeforeToday(dateKey, now = new Date(), timeZone) {
  if (!dateKey) return false;
  return compareDateKeys(dateKey, todayDateKey(now, timeZone)) < 0;
}

/**
 * Build month grid cells for a calendar view.
 * @returns {Array<{ key: string, year: number, month: number, day: number, inMonth: boolean }>}
 */
export function buildMonthGrid(year, month) {
  const firstDow = weekdayOf(year, month, 1);
  const dim = daysInMonth(year, month);
  const cells = [];

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const prevDim = daysInMonth(prev.year, prev.month);
  for (let i = firstDow - 1; i >= 0; i -= 1) {
    const day = prevDim - i;
    cells.push({
      key: formatDateKey(prev.year, prev.month, day),
      year: prev.year,
      month: prev.month,
      day,
      inMonth: false,
    });
  }

  for (let day = 1; day <= dim; day += 1) {
    cells.push({
      key: formatDateKey(year, month, day),
      year,
      month,
      day,
      inMonth: true,
    });
  }

  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({
      key: formatDateKey(next.year, next.month, nextDay),
      year: next.year,
      month: next.month,
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }
  // Prefer a full 6-row grid for stable layout when needed (42 cells).
  while (cells.length < 42) {
    cells.push({
      key: formatDateKey(next.year, next.month, nextDay),
      year: next.year,
      month: next.month,
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }

  return cells;
}

export function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function formatMonthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function formatDisplayValue(value) {
  const parts = parseWallDateTime(value);
  if (!parts.date) return '';
  const parsed = parseDateKey(parts.date);
  if (!parsed) return `${parts.date} ${pad(parts.hour)}:${pad(parts.minute)} ${parts.ampm}`;
  const label = new Date(parsed.year, parsed.month - 1, parsed.day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${label} · ${pad(parts.hour)}:${pad(parts.minute)} ${parts.ampm}`;
}

export const TIME_PRESETS = [
  { label: '8:00 AM', hour: 8, minute: 0, ampm: 'AM' },
  { label: '9:00 AM', hour: 9, minute: 0, ampm: 'AM' },
  { label: '12:00 PM', hour: 12, minute: 0, ampm: 'PM' },
  { label: '5:00 PM', hour: 5, minute: 0, ampm: 'PM' },
];

export const QUICK_SELECTS = [
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'in_3_days', label: 'In 3 days' },
  { id: 'next_monday', label: 'Next Monday' },
];
