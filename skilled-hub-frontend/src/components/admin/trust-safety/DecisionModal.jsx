import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { validateDecision } from '../../../utils/trustSafety';

const TONE_BUTTON = {
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  neutral: 'bg-slate-900 hover:bg-slate-800 text-white',
};

const CONTACT_OUTCOMES = [
  { value: 'reached', label: 'Reached — spoke with reference' },
  { value: 'voicemail', label: 'Left voicemail' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'email_bounced', label: 'Email bounced' },
  { value: 'declined', label: 'Declined to participate' },
];

/**
 * Single modal for every reviewer decision. It collects the reason (when the server
 * requires one), an explicit acknowledgement for irreversible actions, and shows the
 * consequence text supplied by the policy layer so reviewers know what will happen.
 */
export default function DecisionModal({ open, item, action, submitting, serverError, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState('reached');
  const [method, setMethod] = useState('phone');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setConfirmed(false);
      setOutcome('reached');
      setMethod('phone');
      setTimeout(() => textareaRef.current?.focus(), 30);
    }
  }, [open, action?.key, item?.key]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !action || !item) return null;

  const isContactAttempt = action.key === 'contact_attempt';
  const isNote = action.key === 'note';
  const validation = isContactAttempt ? { valid: true, errors: [] } : validateDecision(action, { reason, confirmed });
  const irreversible = action.requires_confirmation;
  const tone = TONE_BUTTON[action.tone] || TONE_BUTTON.neutral;
  const technician = item.technician?.display_name || 'this technician';

  const submit = (e) => {
    e.preventDefault();
    if (!validation.valid || submitting) return;
    onSubmit({ reason: reason.trim(), confirmed, outcome, method });
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 id="decision-title" className="text-sm font-semibold text-slate-900">
              {action.label}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {item.review_type_label} · {technician}
              {item.title ? ` · ${item.title}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <FaTimes className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          {action.consequence && (
            <div className={`flex gap-2 rounded-lg border px-3 py-2.5 text-xs ${action.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-900' : action.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
              {irreversible && <FaExclamationTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />}
              <div>
                <p className="font-semibold">What happens</p>
                <p className="mt-0.5">{action.consequence}</p>
                {action.override && <p className="mt-1 font-medium">This is an override of a previous decision or of the normal workflow.</p>}
              </div>
            </div>
          )}

          {isContactAttempt && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="font-semibold text-slate-700">Outcome</span>
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 text-xs">
                  {CONTACT_OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="font-semibold text-slate-700">Method</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 text-xs">
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="sms">Text message</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
          )}

          <label className="block text-xs">
            <span className="font-semibold text-slate-700">
              {isNote ? 'Note' : isContactAttempt ? 'Notes (optional)' : action.requires_reason ? 'Reason (required)' : 'Reviewer note (optional)'}
            </span>
            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                isNote
                  ? 'Internal note visible to other reviewers in the audit history…'
                  : action.key === 'request_info'
                    ? 'Tell the technician exactly what is needed. This message is sent to them.'
                    : action.key === 'reject'
                      ? 'Explain why. The technician is notified; keep it factual and specific.'
                      : 'Describe the basis for this decision. Recorded in the immutable audit log.'
              }
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/40 focus:border-tf-blue"
            />
          </label>

          {irreversible && (
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-tf-blue focus:ring-tf-blue/40" />
              <span>
                I understand the consequence above and confirm this decision for <strong>{technician}</strong>. My name and timestamp will be recorded.
              </span>
            </label>
          )}

          {serverError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
              {serverError}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
          <p className="text-[11px] text-slate-500 min-h-[1rem]">{!validation.valid && !isContactAttempt ? validation.errors[0] : ''}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!validation.valid || submitting}
              className={`h-8 rounded-md px-3 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${tone}`}
            >
              {submitting ? 'Saving…' : action.label}
            </button>
          </div>
        </footer>
      </form>
    </div>,
    document.body
  );
}
