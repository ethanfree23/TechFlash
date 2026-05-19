import React from 'react';
import useDemoMasquerade from '../../hooks/useDemoMasquerade';
import { auth } from '../../auth';
import AlertModal from '../AlertModal';

export default function DemoQuickAccess() {
  const { busy, error, clearError, masqueradeAs } = useDemoMasquerade();

  if (auth.getUserRole() !== 'admin') return null;

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4" data-demo="masquerade-button">
        <h3 className="text-sm font-semibold text-slate-900">View as another role</h3>
        <p className="mt-1 text-xs text-slate-600">Experience the marketplace as a company or technician.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-demo="masquerade-company"
            disabled={busy != null}
            onClick={() => masqueradeAs('company')}
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === 'company' ? 'Switching…' : 'Bayou City Mechanical'}
          </button>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => masqueradeAs('technician')}
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === 'technician' ? 'Switching…' : 'Demo Technician'}
          </button>
        </div>
      </section>

      {error && (
        <AlertModal isOpen title="Could not switch account" message={error} onClose={clearError} />
      )}
    </>
  );
}
