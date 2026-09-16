import React from 'react';

/**
 * Company-side toggle marking a job as a possible route to a permanent role.
 * The helper text is deliberately worded so the designation cannot be read as an offer.
 */
const PotentialFullTimeToggle = ({ checked, onChange, className = '', disabled = false }) => (
  <div className={className}>
    <h3 className="font-semibold text-slate-900">Potential Full-Time Opportunity</h3>
    <p className="text-xs text-slate-500">
      Mark this job if the technician who completes it could be considered for a permanent
      role with your company. Technicians will see this on the listing. It is not a
      commitment, and it does not change how this job is paid or claimed.
    </p>
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      This job may lead to a full-time position
    </label>
  </div>
);

export default PotentialFullTimeToggle;
