import React from 'react';
import { FaCalendarAlt } from 'react-icons/fa';

export default function JobsCalendarPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-16 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white">
        <FaCalendarAlt className="h-8 w-8 text-slate-400" aria-hidden />
      </div>
      <h3 className="text-xl font-semibold text-slate-800 mb-2">Schedule view coming soon</h3>
      <p className="text-sm text-slate-600 max-w-md mx-auto mb-4">
        A calendar view will let you scan jobs by start date and spot scheduling conflicts at a glance.
      </p>
      <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-800">
        Backend integration needed
      </span>
    </div>
  );
}
