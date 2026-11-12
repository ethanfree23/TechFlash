import React, { useCallback, useEffect, useState } from 'react';
import { adminAchSmokeTestAPI } from '../../api/api';

export default function SystemControlsAchSmokeTest() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [companyId, setCompanyId] = useState('');
  const [amountCents, setAmountCents] = useState('500');
  const [reason, setReason] = useState('');

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await adminAchSmokeTestAPI.list({ limit: 20 });
      setRows(data?.smoke_tests || []);
    } catch (e) {
      setError(e.message || 'Failed to load smoke tests');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const authorize = async (e) => {
    e.preventDefault();
    if (!companyId.trim() || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminAchSmokeTestAPI.create({
        company_profile_id: Number(companyId.trim()),
        amount_cents: Number(amountCents),
        authorization_reason: reason.trim(),
      });
      setReason('');
      await refresh();
    } catch (err) {
      setError(err.message || 'Authorize failed');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (id, action) => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'execute') {
        await adminAchSmokeTestAPI.execute(id);
      } else if (action === 'refund') {
        const refundReason = window.prompt('Refund authorization reason (required):');
        if (!refundReason?.trim()) return;
        await adminAchSmokeTestAPI.refund(id, refundReason.trim());
      }
      await refresh();
    } catch (err) {
      setError(err.message || `${action} failed`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 mt-6 space-y-4">
      <h4 className="text-sm font-semibold text-slate-900">ACH financial smoke test (Option B)</h4>
      <p className="text-xs text-slate-600">
        Isolated $5-max ACH debit — no Job, no ledger, no payouts. Authorize first, then execute once. Refund is separate.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={authorize} className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-slate-600">
          Company profile ID
          <input
            className="block mt-1 border rounded px-2 py-1 text-sm"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-600">
          Amount (cents, max 500)
          <input
            className="block mt-1 border rounded px-2 py-1 text-sm w-24"
            value={amountCents}
            onChange={(e) => setAmountCents(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-600 flex-1 min-w-[12rem]">
          Authorization reason
          <input
            className="block mt-1 border rounded px-2 py-1 text-sm w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 text-sm rounded-lg border border-slate-300 disabled:opacity-50"
        >
          Authorize
        </button>
      </form>
      <ul className="text-sm space-y-2 max-h-56 overflow-auto">
        {rows.map((r) => (
          <li key={r.id} className="border border-slate-200 rounded-lg bg-white p-2">
            <span className="font-mono text-xs">#{r.id}</span> company {r.company_profile_id} · ${(r.amount_cents / 100).toFixed(2)} ·{' '}
            <strong>{r.status}</strong>
            {r.stripe_payment_intent_id && (
              <span className="text-xs text-slate-500 block">PI {r.stripe_payment_intent_id}</span>
            )}
            <span className="flex gap-2 mt-1">
              {r.status === 'authorized' && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs underline"
                  onClick={() => runAction(r.id, 'execute')}
                >
                  Execute charge
                </button>
              )}
              {r.status === 'succeeded' && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs underline text-amber-800"
                  onClick={() => runAction(r.id, 'refund')}
                >
                  Authorize refund
                </button>
              )}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-500 text-sm">No smoke tests yet.</li>}
      </ul>
    </div>
  );
}
