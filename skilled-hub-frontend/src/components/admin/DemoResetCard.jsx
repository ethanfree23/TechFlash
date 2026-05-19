import React from 'react';
import ConfirmModal from '../ConfirmModal';
import AlertModal from '../AlertModal';
import useDemoReset from '../../hooks/useDemoReset';

export default function DemoResetCard({ compact = false }) {
  const { confirmOpen, setConfirmOpen, busy, alert, setAlert, runReset } = useDemoReset();

  if (compact) {
    return (
      <>
        <section
          data-demo="reset-demo-data"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
        >
          <div>
            <p className="text-xs font-semibold text-slate-800">Reset for your next walkthrough</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Restore the polished demo state — same jobs, accounts, and activity every time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Reset demo data
          </button>
        </section>

        <ConfirmModal
          isOpen={confirmOpen}
          title="Reset demo database?"
          message="This restores the demo to its polished seed state. Safe to run between presentations."
          confirmLabel={busy ? 'Resetting…' : 'Reset demo data'}
          onConfirm={runReset}
          onClose={() => !busy && setConfirmOpen(false)}
          keepOpenOnConfirm
          variant="destructive"
        />

        {alert && (
          <AlertModal isOpen title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <section
        data-demo="reset-demo-data"
        className="rounded-xl border border-rose-200 bg-rose-50/50 p-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">Reset demo data</h3>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-2xl">
          Restore the demo database to the polished seed state (96 jobs, marketplace activity, demo accounts).
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          className="mt-3 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-50 disabled:opacity-50"
        >
          Reset demo data
        </button>
      </section>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Reset demo database?"
        message="This will reset the demo database back to the polished seed state."
        confirmLabel={busy ? 'Resetting…' : 'Reset demo data'}
        onConfirm={runReset}
        onClose={() => !busy && setConfirmOpen(false)}
        keepOpenOnConfirm
        variant="destructive"
      />

      {alert && (
        <AlertModal isOpen title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  );
}
