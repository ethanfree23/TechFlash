import React from 'react';
import { getJobDisplayStatus, STATUS_BADGE_CLASSES } from '../../utils/jobStatus';

export default function JobStatusBadge({ job, size = 'sm', layout = 'inline' }) {
  const display = getJobDisplayStatus(job);
  const sizeClass = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  if (layout === 'stack') {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`inline-flex items-center font-semibold rounded-full border whitespace-nowrap ${sizeClass} ${STATUS_BADGE_CLASSES[display.tone] || STATUS_BADGE_CLASSES.gray}`}
        >
          {display.label}
        </span>
        {display.hasCounterPending && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-orange-800 bg-orange-50 border border-orange-200/80 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            Counter
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
      <span
        className={`inline-flex items-center font-semibold rounded-full border whitespace-nowrap ${sizeClass} ${STATUS_BADGE_CLASSES[display.tone] || STATUS_BADGE_CLASSES.gray}`}
      >
        {display.label}
      </span>
      {display.hasCounterPending && (
        <span
          className={`inline-flex items-center font-semibold rounded-full border whitespace-nowrap ${sizeClass} ${STATUS_BADGE_CLASSES.orange}`}
          title="Counter-offer pending"
        >
          Counter pending
        </span>
      )}
    </div>
  );
}
