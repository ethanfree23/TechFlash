import React, { useEffect } from 'react';
import { FaTimes, FaTools } from 'react-icons/fa';

export default function AdminActionPlaceholderModal({ isOpen, actionLabel, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-2xl p-5">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <FaTimes className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="shrink-0 p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-100">
            <FaTools className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{actionLabel || 'Admin action'}</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              This admin action is ready in the UI and needs backend wiring before it can run in production.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              The menu item and workflow are in place — connect the API endpoint to enable this action.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
