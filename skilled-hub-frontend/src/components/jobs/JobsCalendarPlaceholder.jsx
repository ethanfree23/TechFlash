import React from 'react';
import { FaCalendarAlt } from 'react-icons/fa';

export default function JobsCalendarPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-16 text-center">
      <FaCalendarAlt className="mx-auto h-12 w-12 text-slate-300 mb-4" aria-hidden />
      <h3 className="text-lg font-semibold text-slate-800 mb-2">Schedule view coming soon</h3>
      <p className="text-sm text-slate-600 max-w-md mx-auto mb-3">
        A calendar view will let you scan jobs by start date and spot scheduling conflicts at a glance.
      </p>
      <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-800">
        Backend integration needed
      </span>
    </div>
  );
}
