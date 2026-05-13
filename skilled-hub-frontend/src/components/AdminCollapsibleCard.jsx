import React, { useEffect, useMemo, useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import { useCollapsibleSections } from './CollapsibleSectionsContext';

/**
 * Admin detail page card with optional actions and a collapse control (top right).
 */
export default function AdminCollapsibleCard({
  title,
  description,
  actions = null,
  defaultOpen = true,
  persistKey = null,
  children,
}) {
  const registry = useCollapsibleSections();
  const storageKey = useMemo(() => {
    if (persistKey) return `admin-collapsible:${persistKey}`;
    if (typeof window === 'undefined') return null;
    const pageKey = window.location?.pathname || 'unknown-page';
    return `admin-collapsible:${pageKey}:${String(title || 'section').toLowerCase()}`;
  }, [persistKey, title]);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => registry.register(setOpen), [registry, setOpen]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return;
      setOpen(raw === '1');
    } catch {
      // Ignore localStorage read errors; fall back to defaultOpen.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // Ignore localStorage write errors (private mode / quota).
    }
  }, [open, storageKey]);

  const toggle = () => setOpen((o) => !o);
  const label = `${open ? 'Collapse' : 'Expand'} ${title || 'section'}`;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 min-w-0 items-start gap-3 text-left rounded-xl -mx-2 -my-2 px-2 py-2 hover:bg-gray-50"
          aria-expanded={open}
          aria-label={label}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {description ? <p className="text-sm text-gray-500 mt-1">{description}</p> : null}
          </div>
          <FaChevronDown
            className={`w-5 h-5 shrink-0 mt-1 text-gray-500 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </button>
        {actions ? (
          <div className="flex items-center gap-1 shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        ) : null}
      </div>
      {open ? children : null}
    </section>
  );
}
