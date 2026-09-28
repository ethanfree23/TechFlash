import React from 'react';
import { FaPlus } from 'react-icons/fa';

export default function CrmWorkspaceHeader({ lastUpdatedLabel, onAddCompany, onMoreAction }) {
  return (
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Company CRM</h1>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">
          Manage company prospects, qualification, outreach, and TechFlash accounts.
        </p>
        {lastUpdatedLabel ? (
          <p className="mt-1 text-[11px] text-slate-400">Last data refresh {lastUpdatedLabel}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onAddCompany}
          className="inline-flex items-center gap-1.5 rounded-lg bg-tf-blue px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-tf-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-tf-blue/40"
        >
          <FaPlus className="h-3 w-3" aria-hidden />
          Add company
        </button>
        <select
          defaultValue=""
          onChange={(e) => {
            const action = e.target.value;
            if (!action) return;
            onMoreAction?.(action);
            e.target.value = '';
          }}
          className="h-8 min-w-[9.5rem] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-tf-blue/40 focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
          aria-label="More CRM actions"
        >
          <option value="">More actions</option>
          <option value="import">Import prospects</option>
          <option value="create-platform">Create platform account</option>
          <option value="export">Export CRM</option>
          <option value="merge">Dedupe / Merge</option>
        </select>
      </div>
    </div>
  );
}
