import React from 'react';

const SCHEDULE_FLEXIBILITY_OPTIONS = [
  {
    value: 'flexible_start',
    label: 'Flexible start — the job can begin later',
    help:
      'A technician who is busy at the start can propose starting later and still working '
      + 'every day you asked for.',
  },
  {
    value: 'hard_end',
    label: 'Hard end date — the job must finish by the end date',
    help:
      'A technician who is busy at the start can only propose the days that are left before '
      + 'your end date. You will see exactly which of your days they can cover.',
  },
];

/**
 * Decides which alternate schedule a technician with a clashing commitment may propose.
 */
const ScheduleFlexibilityField = ({ value, onChange, labelClass, fieldClass, disabled = false }) => {
  const selected = SCHEDULE_FLEXIBILITY_OPTIONS.find((o) => o.value === value)
    || SCHEDULE_FLEXIBILITY_OPTIONS[0];

  return (
    <div>
      <label className={labelClass} htmlFor="job-schedule-flexibility">Schedule flexibility</label>
      <select
        id="job-schedule-flexibility"
        className={fieldClass}
        value={selected.value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {SCHEDULE_FLEXIBILITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <p className="text-xs text-slate-600 mt-1">{selected.help}</p>
    </div>
  );
};

export default ScheduleFlexibilityField;
