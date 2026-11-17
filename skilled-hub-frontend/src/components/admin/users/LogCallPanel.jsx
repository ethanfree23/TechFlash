import React, { useState } from 'react';
import {
  CALL_OUTCOMES,
  defaultFollowUpLocalValue,
  newClientKey,
} from '../../../utils/technicianActivation';

export default function LogCallPanel({ onSubmit, busy = false, compact = false }) {
  const [outcome, setOutcome] = useState(null);
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [includeFollowUp, setIncludeFollowUp] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (selectedOutcome) => {
    const nextOutcome = selectedOutcome || outcome;
    if (!nextOutcome || busy) return;
    setOutcome(nextOutcome);
    setError(null);
    try {
      await onSubmit?.({
        outcome: nextOutcome,
        body: note.trim() || undefined,
        follow_up_at: includeFollowUp && followUpAt ? new Date(followUpAt).toISOString() : undefined,
        client_key: newClientKey('call'),
      });
      setNote('');
      setIncludeFollowUp(false);
      setFollowUpAt('');
      setOutcome(null);
    } catch (err) {
      setError(err?.message || 'Could not log call');
    }
  };

  return (
    <div className={compact ? '' : 'space-y-2'}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {CALL_OUTCOMES.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => submit(item.id)}
            className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${
              outcome === item.id
                ? 'border-tf-blue bg-tf-blue text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-tf-blue/40 hover:bg-sky-50'
            } disabled:opacity-50`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Quick note (optional)"
        className="mt-2 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
      />
      <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
        <input
          type="checkbox"
          checked={includeFollowUp}
          onChange={(e) => {
            const on = e.target.checked;
            setIncludeFollowUp(on);
            if (on && !followUpAt) setFollowUpAt(defaultFollowUpLocalValue(24));
          }}
        />
        Schedule follow-up
      </label>
      {includeFollowUp && (
        <input
          type="datetime-local"
          value={followUpAt}
          onChange={(e) => setFollowUpAt(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
        />
      )}
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
      {busy && <p className="mt-1 text-[11px] text-slate-400">Saving…</p>}
    </div>
  );
}
