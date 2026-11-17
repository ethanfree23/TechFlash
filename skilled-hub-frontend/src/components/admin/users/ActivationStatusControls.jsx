import React from 'react';
import {
  ACTIVATION_STATUSES,
  ACTIVATION_STATUS_COLORS,
  ACTIVATION_STATUS_LABELS,
  AVAILABILITIES,
  activationStatusLabel,
  availabilityLabel,
} from '../../../utils/technicianActivation';

export default function ActivationStatusControls({
  status = 'new',
  availability = 'unknown',
  onStatusChange,
  onAvailabilityChange,
  busy = false,
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
            ACTIVATION_STATUS_COLORS[status] || ACTIVATION_STATUS_COLORS.new
          }`}
        >
          {activationStatusLabel(status)}
        </span>
        <span className="text-[11px] text-slate-500">{availabilityLabel(availability)}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Activation status
          <select
            value={status || 'new'}
            disabled={busy}
            onChange={(e) => onStatusChange?.(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
          >
            {ACTIVATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACTIVATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Availability
          <select
            value={availability || 'unknown'}
            disabled={busy}
            onChange={(e) => onAvailabilityChange?.(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
          >
            {AVAILABILITIES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[10px] text-slate-400">
        CRM status is admin-managed and never grants job eligibility or bypasses verification.
      </p>
    </div>
  );
}
