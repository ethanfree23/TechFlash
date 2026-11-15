import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { adminTrustSafetyAPI } from '../../../api/api';
import { BULK_ACTIONS, describeApiError } from '../../../utils/trustSafety';

/**
 * Bulk operations are limited to actions that never change an eligibility decision
 * (currently: request more information). Background checks can't be selected at all,
 * and the server still validates every individual write.
 */
export default function BulkActionBar({ items, onClear, onDone, onToast }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const action = BULK_ACTIONS[0];
  if (!items?.length) return null;

  const run = async (e) => {
    e.preventDefault();
    const text = reason.trim();
    if (text.length < 3) return;
    setSubmitting(true);
    let ok = 0;
    const failures = [];
    for (const item of items) {
      try {
        if (item.item_type === 'document') await adminTrustSafetyAPI.requestDocumentInfo(item.id, { reason: text });
        else if (item.item_type === 'reference') await adminTrustSafetyAPI.requestReferenceInfo(item.id, { reason: text });
        else throw new Error('Unsupported item type for bulk action.');
        ok += 1;
      } catch (err) {
        failures.push(`${item.technician?.display_name || item.key}: ${describeApiError(err)}`);
      }
    }
    setSubmitting(false);
    setOpen(false);
    setReason('');
    onToast?.({ tone: failures.length ? 'error' : 'success', message: failures.length ? `${ok} sent, ${failures.length} failed. ${failures[0]}` : `Information request sent to ${ok} technician${ok === 1 ? '' : 's'}.` });
    onDone?.();
  };

  return (
    <>
      <div className="sticky bottom-3 z-30 mx-auto max-w-3xl rounded-xl border border-slate-800 bg-slate-900 text-white shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold tabular-nums">{items.length} selected</span>
        <span className="text-[11px] text-slate-300 hidden sm:inline">Only safe, non-decision actions are available in bulk.</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-md bg-white text-slate-900 px-3 text-xs font-semibold hover:bg-slate-100">
            {action.label}
          </button>
          <button type="button" onClick={onClear} className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800" aria-label="Clear selection">
            <FaTimes className="h-3 w-3" />
          </button>
        </div>
      </div>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
            <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => !submitting && setOpen(false)} />
            <form onSubmit={run} className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              <header className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">{action.label}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
              </header>
              <div className="px-5 py-4 space-y-3">
                <ul className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs">
                  {items.map((it) => (
                    <li key={it.key} className="px-3 py-1.5 flex justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">{it.technician?.display_name}</span>
                      <span className="text-slate-500 truncate">
                        {it.review_type_label}
                        {it.title ? ` · ${it.title}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700">Message to technicians (required)</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Describe exactly what is missing or needs to be re-submitted."
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/40 focus:border-tf-blue"
                  />
                </label>
              </div>
              <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
                <button type="button" onClick={() => setOpen(false)} disabled={submitting} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={submitting || reason.trim().length < 3} className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {submitting ? 'Sending…' : `Send to ${items.length}`}
                </button>
              </footer>
            </form>
          </div>,
          document.body
        )}
    </>
  );
}
