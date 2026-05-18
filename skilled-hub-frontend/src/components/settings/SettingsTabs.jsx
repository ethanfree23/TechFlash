import React from 'react';

/**
 * Horizontal tab list for settings main nav. Tabs share equal width across the row.
 */
export default function SettingsTabs({ tabs, activeId, onChange, ariaLabel = 'Settings sections' }) {
  return (
    <div className="w-full pb-px" role="tablist" aria-label={ariaLabel}>
      <div className="flex w-full gap-0 border-b border-gray-200">
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
              className={`flex-1 min-w-0 px-2 sm:px-3 py-3 text-sm font-medium text-center transition-colors border-b-2 -mb-px leading-snug ${
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
