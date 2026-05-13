import React from 'react';
import { getDataQualityScore, getNextBestActions, getRelationshipTemperature } from '../../utils/crmDisplayAdapter';

export default function CrmRightRail({ form, metrics, crmNotesLength, isLinked, onAction }) {
  const score = getDataQualityScore(form);
  const actions = getNextBestActions({ form, metrics, crmNotesLength, isLinked });
  const rel = getRelationshipTemperature(form?.status);

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
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
        <p className="mt-2 text-xs text-slate-600">
          Records with phone, contact, and trade type are easier to convert.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Relationship</h3>
        <p className="mt-2 text-sm font-semibold text-slate-900">{rel.label}</p>
      </div>
    </aside>
  );
}
