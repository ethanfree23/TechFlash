import React from 'react';

/**
 * Horizontal scroll tab list for settings main nav.
 */
export default function SettingsTabs({ tabs, activeId, onChange, ariaLabel = 'Settings sections' }) {
  return (
    <div className="-mx-1 overflow-x-auto overscroll-x-contain scrollbar-thin pb-px" role="tablist" aria-label={ariaLabel}>
      <div className="flex min-w-min gap-0 border-b border-gray-200 px-1">
        {tabs.map(({ id, label }) => {
          const selected = activeId === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(id)}
              className={`shrink-0 px-3 sm:px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                selected
                  ? 'text-blue-600 border-blue-600 bg-blue-50/60'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50/80'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
