import React, { useState, useId } from 'react';

/**
 * White card with optional collapsible body (chevron in header).
 */
export default function SettingsCard({
  title,
  description,
  headerRight,
  children,
  className = '',
  collapsible = false,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const buttonId = useId();

  if (!collapsible) {
    return (
      <div
        className={`rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}
      >
        {(title || description || headerRight) && (
          <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100 bg-white">
            <div className="min-w-0">
              {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
              {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
            </div>
            {headerRight && <div className="shrink-0">{headerRight}</div>}
          </div>
        )}
        <div className="px-4 sm:px-5 py-4">{children}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-start gap-2 px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 py-1 -my-1"
        >
          <span
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600"
            aria-hidden
          >
            <svg
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <span className="min-w-0">
            {title && <span className="block text-sm font-semibold text-gray-900">{title}</span>}
            {description && <span className="block text-sm text-gray-600 mt-0.5">{description}</span>}
          </span>
        </button>
        {headerRight && <div className="shrink-0 pt-1">{headerRight}</div>}
      </div>
      {open && (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="px-4 sm:px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
