import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import { jobsAPI } from '../../api/api';

const STEPS = [
  { id: 1, label: 'When work ended' },
  { id: 2, label: 'Hours worked' },
  { id: 3, label: 'Reason' },
  { id: 4, label: 'Review' },
];

const formatCents = (cents) => {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents) / 100);
};

const formatHours = (hours) => {
  if (hours == null || hours === '') return '—';
  const n = Number(hours);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? `${n}` : n.toFixed(2);
};

const toDatetimeLocal = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromDatetimeLocal = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const formatWhen = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

function EntryList({ title, entries, empty }) {
  if (!entries?.length) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</p>
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id} className="text-sm text-slate-700 flex justify-between gap-3 border border-slate-100 rounded px-2 py-1">
            <span>
              {entry.worked_on_date || '—'} · {formatHours(entry.worked_hours)} hrs
            </span>
            <span className="text-slate-500">{entry.gross_pay_cents != null ? formatCents(entry.gross_pay_cents) : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EndAssignmentModal({ job, isOpen, onClose, onEnded }) {
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [financialsStale, setFinancialsStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [effectiveEndLocal, setEffectiveEndLocal] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const loadPreview = useCallback(async (effectiveEndIso) => {
    if (!job?.id) return;
    setLoading(true);
    setError('');
    try {
      const data = await jobsAPI.terminationPreview(job.id, effectiveEndIso);
      const next = data?.termination_preview || data;
      setPreview(next);
      setFinancialsStale(false);
      if (!effectiveEndLocal && next?.default_effective_end_at) {
        setEffectiveEndLocal(toDatetimeLocal(next.default_effective_end_at));
      }
    } catch (err) {
      setError(err.message || 'Could not load the assignment summary.');
    } finally {
      setLoading(false);
    }
  }, [job?.id, effectiveEndLocal]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setReason('');
    setNotes('');
    setError('');
    setPreview(null);
    setEffectiveEndLocal('');
    setFinancialsStale(false);
    loadPreview();
  }, [isOpen, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshWithEnd = async () => {
    const iso = fromDatetimeLocal(effectiveEndLocal);
    await loadPreview(iso);
  };

  const goNext = async () => {
    if (step === 3) {
      setFinancialsStale(true);
      setError('');
      setStep(4);
      await refreshWithEnd();
      return;
    }
    if (step === 1) {
      await refreshWithEnd();
    }
    setStep((current) => current + 1);
  };

  const submittedCount = preview?.time_entries?.submitted_count || 0;
  const blockers = preview?.blockers || [];
  const otherNeedsNotes = reason === 'other' && !notes.trim();
  const financialsCurrent = Boolean(preview) && !loading && !financialsStale;
  const canConfirm = financialsCurrent && preview?.terminable && reason && !otherNeedsNotes && submittedCount === 0 && !preview?.effective_end_at_error;

  const nextDisabled = useMemo(() => {
    if (loading || !preview) return true;
    if (step === 1) return Boolean(preview.effective_end_at_error);
    if (step === 2) return submittedCount > 0 || blockers.some((b) => b.code === 'unresolved_submitted_time_entries');
    if (step === 3) return !reason || otherNeedsNotes;
    return !canConfirm;
  }, [loading, preview, step, submittedCount, blockers, reason, otherNeedsNotes, canConfirm]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await jobsAPI.terminate(job.id, {
        reason,
        notes: notes.trim() || undefined,
        effective_end_at: fromDatetimeLocal(effectiveEndLocal) || preview?.effective_end_at,
      });
      onEnded?.(result);
    } catch (err) {
      setError(err.message || 'Could not end this assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const gjp = Boolean(preview?.guaranteed_job_pay);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      ariaHideApp={false}
      shouldCloseOnOverlayClick={!submitting}
      overlayClassName="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto outline-none"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">End assignment early</h2>
          <p className="text-sm text-slate-600 mt-1">
            This ends future work on {job?.title || 'this job'}. Approved hours already worked stay payable.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 text-sm">Close</button>
      </div>

      <ol className="grid grid-cols-4 gap-2 mb-6">
        {STEPS.map((item) => (
          <li
            key={item.id}
            className={`text-[11px] sm:text-xs font-semibold rounded-full px-2 py-1 text-center border ${
              step === item.id ? 'bg-slate-900 text-white border-slate-900' : step > item.id ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            {item.label}
          </li>
        ))}
      </ol>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {((loading && !preview) || (step === 4 && !financialsCurrent && !error)) && (
        <p className="text-sm text-slate-500">
          {step === 4 ? 'Loading current financial summary…' : 'Loading assignment summary…'}
        </p>
      )}

      {preview && step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Confirm when the technician&apos;s work on this assignment actually ended. This cannot be earlier than the last approved time entry.
          </p>
          <label className="block text-sm font-medium text-slate-700">
            Effective end
            <input
              type="datetime-local"
              className="mt-1 w-full border rounded-md p-2"
              value={effectiveEndLocal}
              onChange={(e) => setEffectiveEndLocal(e.target.value)}
              onBlur={refreshWithEnd}
            />
          </label>
          {preview.effective_end_at_error && (
            <p className="text-sm text-red-600">{preview.effective_end_at_error}</p>
          )}
          <p className="text-xs text-slate-500">
            Originally scheduled through {formatWhen(preview.original?.scheduled_end_at)}.
          </p>
        </div>
      )}

      {preview && step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Ending the assignment does not change hours that are already approved. Submitted hours must be approved or rejected first.
          </p>
          {submittedCount > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {submittedCount} time {submittedCount === 1 ? 'entry is' : 'entries are'} still submitted. Approve or reject {submittedCount === 1 ? 'it' : 'them'} in Hours worked before you can continue.
            </div>
          )}
          <EntryList title="Approved" entries={preview.time_entries?.approved} empty="No approved hours yet." />
          <EntryList title="Submitted (must be resolved)" entries={preview.time_entries?.submitted} empty="No outstanding submitted hours." />
          <EntryList title="Rejected" entries={preview.time_entries?.rejected} empty="No rejected hours." />
          <p className="text-sm font-medium text-slate-800">
            Approved total: {formatHours(preview.time_entries?.approved_hours)} hours · {formatCents(preview.time_entries?.approved_gross_labor_cents)}
          </p>
        </div>
      )}

      {preview && step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            This reason is for your records. It does not change what the technician is paid.
          </p>
          <label className="block text-sm font-medium text-slate-700">
            Reason
            <select className="mt-1 w-full border rounded-md p-2 bg-white" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason</option>
              {(preview.reasons || []).map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Notes {reason === 'other' ? '(required)' : '(optional)'}
            <textarea
              className="mt-1 w-full border rounded-md p-2"
              rows={4}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={reason === 'other' ? 'Describe why you are ending this assignment.' : 'Add context for your records.'}
            />
          </label>
        </div>
      )}

      {financialsCurrent && step === 4 && (
        <div className="space-y-3 text-sm text-slate-700">
          <div className="rounded-lg border border-slate-200 divide-y">
            <div className="px-3 py-2 flex justify-between gap-3"><span>Original assignment</span><span>{formatWhen(preview.original?.scheduled_start_at)} – {formatWhen(preview.original?.scheduled_end_at)}</span></div>
            <div className="px-3 py-2 flex justify-between gap-3"><span>Effective end</span><span>{formatWhen(preview.effective_end_at)}</span></div>
            <div className="px-3 py-2 flex justify-between gap-3"><span>Approved work</span><span>{formatHours(preview.time_entries?.approved_hours)} hrs · {formatCents(preview.time_entries?.approved_gross_labor_cents)}</span></div>
            <div className="px-3 py-2 flex justify-between gap-3"><span>Future work canceled</span><span>{formatHours(preview.canceled_scheduled_hours)} hrs</span></div>
            <div className="px-3 py-2 flex justify-between gap-3"><span>Pay basis</span><span>{gjp ? 'Guaranteed Job Pay' : 'Hours Worked Only'}</span></div>
            <div className="px-3 py-2 flex justify-between gap-3"><span>Technician payable</span><span>{formatCents(preview.projected?.technician_payout_cents)}</span></div>
            <div className="px-3 py-2 flex justify-between gap-3">
              <span>{gjp ? 'Company refund' : 'Estimated company refund'}</span>
              <span>{gjp ? 'None — the guarantee still applies' : formatCents(preview.projected?.refund_cents)}</span>
            </div>
          </div>
          {gjp ? (
            <p className="text-sm text-slate-600">
              Ending this assignment early does not reduce the technician&apos;s guaranteed job pay of {formatCents(preview.original?.agreed_labor_cents)}.
            </p>
          ) : preview.zero_hour_termination ? (
            <p className="text-sm text-slate-600">
              No approved hours were recorded. The technician is owed $0.00 and the funded amount is refunded to the company.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              The technician is paid for approved hours only. The unworked funded portion is refunded to your original payment method.
            </p>
          )}
          <p className="text-xs text-slate-500">Payout follows the normal schedule. Refunds can take several business days to appear.</p>
        </div>
      )}

      {blockers.length > 0 && step !== 2 && (
        <ul className="mt-3 text-sm text-red-700 list-disc pl-5">
          {blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}
        </ul>
      )}

      <div className="mt-6 flex justify-between gap-2">
        <button type="button" onClick={() => (step === 1 ? onClose() : setStep(step - 1))} className="px-4 py-2 border rounded-md text-sm" disabled={submitting}>
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step < 4 ? (
          <button type="button" onClick={goNext} disabled={nextDisabled} className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm disabled:opacity-50">
            Continue
          </button>
        ) : (
          <button type="button" onClick={handleConfirm} disabled={nextDisabled || submitting || !financialsCurrent} className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold disabled:opacity-50">
            {submitting ? 'Ending assignment…' : 'End assignment'}
          </button>
        )}
      </div>
    </Modal>
  );
}
