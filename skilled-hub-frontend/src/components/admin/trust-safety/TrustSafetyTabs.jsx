import React from 'react';
import { TRUST_SAFETY_TABS } from '../../../utils/trustSafety';

export default function TrustSafetyTabs({ activeTab, counts = {}, onChange }) {
  return (
    <div className="-mx-1 px-1 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Trust & Safety sections">
      <div className="inline-flex gap-0.5 p-0.5 rounded-lg bg-slate-100/90 border border-slate-200/80 min-w-min">
        {TRUST_SAFETY_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          const count = counts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                selected ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span
                  className={`inline-flex min-w-[1.125rem] justify-center rounded px-1 py-px text-[10px] font-semibold tabular-nums ${
                    selected ? 'bg-orange-50 text-orange-800' : 'text-slate-400'
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
