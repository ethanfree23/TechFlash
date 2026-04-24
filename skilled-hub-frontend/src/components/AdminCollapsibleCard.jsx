import React, { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';

/**
 * Admin detail page card with optional actions and a collapse control (top right).
 */
export default function AdminCollapsibleCard({ title, description, actions = null, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {description ? <p className="text-sm text-gray-500 mt-1">{description}</p> : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {actions}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-transparent hover:border-gray-200"
            aria-expanded={open}
            aria-label={open ? 'Collapse section' : 'Expand section'}
          >
            <FaChevronDown className={`w-5 h-5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {open ? children : null}
    </section>
  );
}
