import React from 'react';
import { CrmStatusBadge } from './CrmBadges';
import { CRM_STATUSES } from '../../utils/crmConstants';
import { getDataQualityScore, getNextBestActions, getRelationshipTemperature } from '../../utils/crmDisplayAdapter';

export default function CrmRightRail({
  form,
  metrics,
  crmNotesLength,
  isLinked,
  onAction,
  outreachSnapshot,
  operationalInsights,
  formatDateTime,
  statusEditing,
  onStatusEdit,
  onStatusChange,
  onStatusSave,
  onStatusCancel,
  statusSaving,
}) {
  const score = getDataQualityScore(form);
  const actions = getNextBestActions({ form, metrics, crmNotesLength, isLinked });
  const rel = getRelationshipTemperature(form?.status);

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</h3>
          {!statusEditing ? (
            <button type="button" onClick={onStatusEdit} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={onStatusCancel} className="text-xs text-slate-600 hover:text-slate-900">
                Cancel
              </button>
              <button
                type="button"
                onClick={onStatusSave}
                disabled={statusSaving}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
              >
                {statusSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
        {statusEditing ? (
          <select
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm capitalize bg-white"
            value={form?.status || 'lead'}
            onChange={(e) => onStatusChange?.(e.target.value)}
          >
            {CRM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <CrmStatusBadge status={form?.status} />
        )}
      </div>
      {outreachSnapshot && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Outreach snapshot</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
            <dt className="text-slate-500">First touch</dt>
            <dd>{outreachSnapshot.firstContactDate ? formatDateTime(outreachSnapshot.firstContactDate) : '—'}</dd>
            <dt className="text-slate-500">Last touch</dt>
            <dd>{outreachSnapshot.lastContactDate ? formatDateTime(outreachSnapshot.lastContactDate) : '—'}</dd>
            <dt className="text-slate-500">Calls / emails</dt>
            <dd>
              {outreachSnapshot.calls} / {outreachSnapshot.emails}
            </dd>
            <dt className="text-slate-500">Notes</dt>
            <dd>{outreachSnapshot.notesCount}</dd>
            <dt className="text-slate-500">Outreach status</dt>
            <dd className="font-semibold">{outreachSnapshot.outreachStatus}</dd>
          </dl>
        </div>
      )}
      {operationalInsights != null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Operational insight</h3>
          {operationalInsights.length === 0 ? (
            <p className="text-xs text-slate-500">No automated insights for this record yet.</p>
          ) : (
            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700">
              {operationalInsights.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Next best actions</h3>
        <ul className="mt-3 space-y-2">
          {actions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAction?.(a.id)}
                className="w-full text-left rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-blue-50 hover:border-blue-100"
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Data quality</h3>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-3xl font-bold text-slate-900 tabular-nums">{score}</span>
          <span className="text-sm text-slate-500 mb-1">/ 100</span>
        </div>
        <p className="mt-2 text-xs text-slate-600">Records with phone, contact, and trade type are easier to convert.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Relationship</h3>
        <p className="mt-2 text-sm font-semibold text-slate-900">{rel.label}</p>
      </div>
    </aside>
  );
}
