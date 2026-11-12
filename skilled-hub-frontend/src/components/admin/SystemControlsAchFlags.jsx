import React, { useCallback, useEffect, useState } from 'react';
import { adminAchSettingsAPI } from '../../api/api';
import SystemControlsAchSmokeTest from './SystemControlsAchSmokeTest';

export default function SystemControlsAchFlags() {
  const [data, setData] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [companyId, setCompanyId] = useState('');
  const [companyEnabled, setCompanyEnabled] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [settings, mon] = await Promise.all([
        adminAchSettingsAPI.get(),
        adminAchSettingsAPI.monitoring({ pending_funding_days: 3 }),
      ]);
      setData(settings);
      setMonitoring(mon);
    } catch (e) {
      setError(e.message || 'Failed to load ACH settings');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleGlobal = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminAchSettingsAPI.setGlobal(!data?.global_ach_payments_enabled);
      await refresh();
    } catch (e) {
      setError(e.message || 'Failed to update global ACH');
    } finally {
      setBusy(false);
    }
  };

  const saveCompany = async (e) => {
    e.preventDefault();
    if (!companyId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminAchSettingsAPI.setCompany(companyId.trim(), companyEnabled);
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to update company ACH');
    } finally {
      setBusy(false);
    }
  };

  const ach = monitoring?.ach_by_status || {};
  const global = monitoring?.global || data || {};

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-900">ACH feature flags</h3>
        <p className="text-sm text-slate-600 mt-1">
          Deploy with ACH off, then pilot approved companies. Global kill switch and per-company flags
          gate new ACH initiation only — webhooks, refunds, disputes, and reconcile stay live.
        </p>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-700">
            Global DB flag:{' '}
            <strong>{global.global_ach_payments_enabled ? 'ON' : 'OFF'}</strong>
            {global.ach_global_disabled_env ? ' (ENV ACH_GLOBAL_DISABLED forces OFF)' : ''}
          </span>
          <button
            type="button"
            disabled={busy || !data}
            onClick={toggleGlobal}
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white disabled:opacity-50"
          >
            {global.global_ach_payments_enabled ? 'Turn global ACH off' : 'Turn global ACH on'}
          </button>
          <span className="text-sm text-slate-500">
            Enabled companies: {global.enabled_companies_count ?? '—'}
          </span>
        </div>
      </div>

      <form onSubmit={saveCompany} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Set company ACH flag</h4>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm text-slate-700">
            Company profile ID
            <input
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 block w-40 border rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
            <input
              type="checkbox"
              checked={companyEnabled}
              onChange={(e) => setCompanyEnabled(e.target.checked)}
            />
            Enabled
          </label>
          <button
            type="submit"
            disabled={busy || !companyId.trim()}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 disabled:opacity-50"
          >
            Save company flag
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Prefer the company user detail page for named toggles; this is a quick ID-based control.
        </p>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">ACH monitoring</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Mon label="ACH processing" value={ach.processing} />
          <Mon label="ACH succeeded" value={ach.succeeded} />
          <Mon label="ACH failed" value={ach.failed} />
          <Mon label="ACH outcome_unknown" value={ach.outcome_unknown} />
          <Mon label="Failed w/o PI" value={monitoring?.collections_failed_without_pi} />
          <Mon label="Collections unknown" value={monitoring?.collections_outcome_unknown} />
          <Mon label="ACH returned/disputed" value={ach.returned ?? monitoring?.returned_or_disputed} />
          <Mon label="Open risks" value={monitoring?.open_risk_events} />
          <Mon label="Transfers outcome_unknown" value={monitoring?.transfers_outcome_unknown} />
          <Mon label="Flagged mismatch" value={monitoring?.transfers_flagged_mismatch} />
          <Mon label="Pending funding &gt;3d" value={monitoring?.jobs_pending_funding_older_than_days} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-2">Recent audits</h4>
        <ul className="text-sm text-slate-700 space-y-1 max-h-64 overflow-auto">
          {(data?.recent_audits || []).map((a) => (
            <li key={a.id} className="border-b border-slate-100 py-1.5">
              <span className="font-mono text-xs text-slate-500">{a.created_at}</span>{' '}
              {a.scope} {String(a.old_value)}→{String(a.new_value)} by {a.actor_email || a.actor_user_id || '—'}
              {a.company_profile_id ? ` (company ${a.company_profile_id})` : ''}
            </li>
          ))}
          {(data?.recent_audits || []).length === 0 && (
            <li className="text-slate-500">No ACH flag audits yet.</li>
          )}
        </ul>
      </div>

      <SystemControlsAchSmokeTest />
    </div>
  );
}

function Mon({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value ?? '—'}</div>
    </div>
  );
}
