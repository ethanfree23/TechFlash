import React from 'react';

/**
 * Segmented tab bar + single visible panel for CRM record detail.
 * @param {{ id: string, label: string, badge?: number | string | null }[]} tabs
 * @param {string} activeTab
 * @param {(id: string) => void} onTabChange
 * @param {Record<string, React.ReactNode>} panels
 */
export default function CrmDetailTabs({ tabs, activeTab, onTabChange, panels }) {
  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const active = safeTabs.some((t) => t.id === activeTab) ? activeTab : safeTabs[0]?.id;

  return (
    <div>
      <div className="border-b border-slate-100 px-4 pt-3 pb-0 bg-gradient-to-r from-slate-50/80 to-white">
        <div
          className="-mx-1 px-1 overflow-x-auto scrollbar-thin"
          role="tablist"
          aria-label="Company record sections"
        >
          <div className="inline-flex gap-0.5 p-0.5 rounded-lg bg-slate-100/90 border border-slate-200/80 min-w-min mb-3">
            {safeTabs.map((tab) => {
              const selected = active === tab.id;
              const badge = tab.badge;
              const showBadge = badge != null && badge !== '' && Number(badge) !== 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`crm-detail-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`crm-detail-panel-${tab.id}`}
                  onClick={() => onTabChange(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                    selected
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {tab.label}
                  {showBadge ? (
                    <span
                      className={`inline-flex min-w-[1.125rem] justify-center rounded px-1 py-px text-[10px] font-bold tabular-nums ${
                        selected ? 'bg-slate-100 text-slate-700' : 'bg-white/80 text-slate-500'
                      }`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {safeTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <div
            key={tab.id}
            id={`crm-detail-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`crm-detail-tab-${tab.id}`}
            hidden={!isActive}
            className={isActive ? 'block p-6' : 'hidden'}
          >
            {isActive ? panels[tab.id] : null}
          </div>
        );
      })}
    </div>
  );
}
