import React from 'react';
import { SAVED_VIEW_PRESETS } from '../../../utils/adminUsersDisplayAdapter';

export default function UsersSavedViews({ activeViewId, onSelectView }) {
  return (
    <div className="mb-3 -mx-1 px-1 overflow-x-auto">
      <div className="flex items-center gap-1.5 min-w-min pb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 pr-0.5">Views</span>
        {SAVED_VIEW_PRESETS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => onSelectView(view)}
            className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
              activeViewId === view.id
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200/90 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>
    </div>
  );
}
