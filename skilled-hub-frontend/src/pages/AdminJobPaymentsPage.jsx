import React, { useCallback, useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import AppFooter from '../components/layout/AppFooter';
import { adminJobPaymentsAPI } from '../api/api';

const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

const statusTone = (row) => {
  if (row.needs_attention || row.status === 'failed' || row.dispute_status) return 'text-red-700 bg-red-50';
  if (row.status === 'processing') return 'text-orange-800 bg-orange-50';
  if (row.status === 'succeeded') return 'text-emerald-800 bg-emerald-50';
  return 'text-slate-700 bg-slate-50';
};

const AdminJobPaymentsPage = ({ user, onLogout }) => {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsAttention, setNeedsAttention] = useState(true);
  const [methodType, setMethodType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminJobPaymentsAPI.list({
        needs_attention: needsAttention ? 'true' : '',
        payment_method_type: methodType || undefined,
        status: status || undefined,
        q: q || undefined,
        limit: 100,
      });
      setRows(Array.isArray(res?.job_payments) ? res.job_payments : []);
      setCounts(res?.attention_counts || {});
    } catch (err) {
      setError(err.message || 'Could not load payments');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [needsAttention, methodType, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppHeader user={user} onLogout={onLogout} currentPage="job_payments" />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Job payments</h1>
          <p className="text-sm text-slate-600 mt-1">
            Monitor card and ACH collections, settlement status, failures, returns, and disputes.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            ['ACH processing', counts.ach_processing],
            ['Processing', counts.processing],
            ['Failed', counts.failed],
            ['Disputed', counts.disputed],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">{value ?? '—'}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Attention only</span>
            <select
              value={needsAttention ? '1' : '0'}
              onChange={(e) => setNeedsAttention(e.target.value === '1')}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="1">Needs attention</option>
              <option value="0">All transactions</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Method</span>
            <select
              value={methodType}
              onChange={(e) => setMethodType(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">Any</option>
              <option value="card">Card</option>
              <option value="us_bank_account">ACH / bank</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">Any</option>
              <option value="processing">processing</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="requires_action">requires_action</option>
              <option value="pending">pending</option>
            </select>
          </label>
          <label className="text-sm flex-1 min-w-[180px]">
            <span className="block text-slate-600 mb-1">Search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company, job, Stripe PI…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg bg-[#1d4ed8] text-white text-sm hover:bg-blue-800"
          >
            Refresh
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No matching payment transactions.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Company / Job</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Stripe</th>
                  <th className="px-3 py-2 font-medium">Dates</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.company_name || '—'}</div>
                      <div className="text-slate-600">{row.job_title || `Job #${row.job_id}`}</div>
                      <div className="text-xs text-slate-500">{row.transaction_type?.replace(/_/g, ' ')}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{row.payment_method_display || row.payment_method_type || '—'}</div>
                      {row.dispute_status && (
                        <div className="text-xs text-red-700 mt-1">Dispute: {row.dispute_status}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{money(row.amount_cents)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${statusTone(row)}`}>
                        {row.status}
                      </span>
                      <div className="text-xs text-slate-500 mt-1">
                        funding: {row.funding_status || '—'} · settlement: {row.settlement_status || '—'}
                      </div>
                      {row.error_message && (
                        <div className="text-xs text-red-600 mt-1 max-w-xs">{row.error_message}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs break-all max-w-[180px]">
                      {row.stripe_payment_intent_id || row.stripe_refund_id || row.stripe_transfer_id || '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                      <div>Created: {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</div>
                      {row.processing_at && (
                        <div>Processing: {new Date(row.processing_at).toLocaleString()}</div>
                      )}
                      {row.succeeded_at && (
                        <div>Succeeded: {new Date(row.succeeded_at).toLocaleString()}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

export default AdminJobPaymentsPage;
