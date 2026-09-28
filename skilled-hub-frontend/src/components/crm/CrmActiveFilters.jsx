import React from 'react';
import { FaTimes } from 'react-icons/fa';

export default function CrmActiveFilters({ filters, onClearAll }) {
  const chips = Array.isArray(filters) ? filters : [];
  if (!chips.length) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-tf-blue/30"
        >
          <span>{chip.label}</span>
          <FaTimes className="h-2.5 w-2.5 text-slate-400" aria-hidden />
          <span className="sr-only">Remove {chip.label} filter</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="px-1.5 text-[11px] font-semibold text-tf-blue hover:text-tf-blue-dark focus:outline-none focus-visible:underline"
      >
        Clear all
      </button>
    </div>
  );
}
