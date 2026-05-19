import React from 'react';
import { USER_TABS } from '../../../utils/adminUsersDisplayAdapter';

export default function UsersSegmentedTabs({ activeTab, tabCounts, onChange }) {
  return (
    <div className="mb-3 -mx-1 px-1 overflow-x-auto scrollbar-thin">
      <div className="inline-flex gap-0.5 p-0.5 rounded-lg bg-slate-100/90 border border-slate-200/80 min-w-min">
        {USER_TABS.map((tab) => {
          const count = tabCounts[tab.id];
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-demo={tab.id === 'company' ? 'company-profile' : tab.id === 'technicians' ? 'technician-profile' : undefined}
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                selected
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {tab.label}
              {count != null && (
                <span
                  className={`inline-flex min-w-[1.125rem] justify-center rounded px-1 py-px text-[10px] font-semibold tabular-nums ${
                    selected ? 'bg-slate-100 text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
