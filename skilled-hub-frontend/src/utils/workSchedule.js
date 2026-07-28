export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export const WEEKEND_WORK_OPTIONS = [
  { value: 'prohibited', label: 'No weekend work' },
  { value: 'optional', label: 'Weekend work may be offered if needed' },
  { value: 'required', label: 'Weekend work is required as part of this job' },
];

export const DAY_WORK_POLICY_OPTIONS = [
  { value: 'unavailable', label: 'Not available' },
  { value: 'normal_rate', label: 'Available at normal rate' },
  { value: 'premium_rate', label: 'Available with premium pay' },
];

export const DEFAULT_STANDARD_WORK_DAYS = [1, 2, 3, 4, 5];

export const toMultiplierLabel = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (num === 1) return 'Normal rate';
  if (num === 1.5) return 'Time and a half';
  if (num === 2) return 'Double time';
  return `${num.toFixed(1)}× regular rate`;
};

export const formatWeekdayList = (days) => {
  const set = new Set(Array.isArray(days) ? days.map((d) => Number(d)) : []);
  return WEEKDAY_OPTIONS.filter((d) => set.has(d.value)).map((d) => d.label).join(', ');
};

export const isWeekendDay = (cwday) => cwday === 6 || cwday === 7;

export const computeExpectedCompletion = ({ startAt, workDaysCount, hoursPerDay, standardWorkDays }) => {
  if (!startAt) return '';
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return '';

  const selectedDays = (Array.isArray(standardWorkDays) && standardWorkDays.length > 0 ? standardWorkDays : DEFAULT_STANDARD_WORK_DAYS)
    .map((d) => Number(d));
  const neededDays = Math.max(1, Number.parseInt(workDaysCount, 10) || 1);
  const hpd = Math.max(1, Number.parseInt(hoursPerDay, 10) || 8);

  let worked = 0;
  const end = new Date(start);
  while (worked < neededDays) {
    const jsDay = end.getDay();
    const cwday = jsDay === 0 ? 7 : jsDay;
    if (selectedDays.includes(cwday)) worked += 1;
    if (worked >= neededDays) break;
    end.setDate(end.getDate() + 1);
  }
  end.setHours(start.getHours() + hpd + 1, start.getMinutes(), 0, 0);
  return end.toISOString();
};

export const buildScheduleSummary = ({
  standardWorkDays,
  weekendWorkPolicy,
  saturdayWorkPolicy,
  sundayWorkPolicy,
  saturdayMultiplier,
  sundayMultiplier,
  overtimeEnabled,
  overtimeMultiplier,
}) => {
  const weekdayLine = `Work is expected ${formatWeekdayList(standardWorkDays) || 'Monday through Friday'}.`;
  let weekendLine = 'No work will take place Saturday or Sunday. If unfinished Friday, work resumes the next scheduled day.';

  if (weekendWorkPolicy === 'optional') {
    const sat = saturdayWorkPolicy === 'premium_rate'
      ? `Saturday may be offered at ${toMultiplierLabel(saturdayMultiplier || 1.5)}.`
      : saturdayWorkPolicy === 'normal_rate'
        ? 'Saturday may be offered at normal rate.'
        : 'Saturday is not permitted.';
    const sun = sundayWorkPolicy === 'premium_rate'
      ? `Sunday may be offered at ${toMultiplierLabel(sundayMultiplier || 1.5)}.`
      : sundayWorkPolicy === 'normal_rate'
        ? 'Sunday may be offered at normal rate.'
        : 'Sunday is not permitted.';
    weekendLine = `${sat} ${sun} Weekend work requires company approval and technician acceptance.`;
  }

  if (weekendWorkPolicy === 'required') {
    const sat = saturdayWorkPolicy === 'unavailable' ? '' : `Saturday is required (${toMultiplierLabel(saturdayWorkPolicy === 'premium_rate' ? (saturdayMultiplier || 1.5) : 1.0)}).`;
    const sun = sundayWorkPolicy === 'unavailable' ? '' : `Sunday is required (${toMultiplierLabel(sundayWorkPolicy === 'premium_rate' ? (sundayMultiplier || 1.5) : 1.0)}).`;
    weekendLine = `${sat} ${sun}`.trim();
  }

  const overtimeLine = overtimeEnabled
    ? `Overtime applies at ${Number(overtimeMultiplier || 1.5).toFixed(1)}× when thresholds are met.`
    : 'Overtime is not enabled for this job.';

  return `${weekdayLine} ${weekendLine} ${overtimeLine}`;
};
