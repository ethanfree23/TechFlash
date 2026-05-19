import React from 'react';
import { FaSyncAlt } from 'react-icons/fa';
import ConfirmModal from '../ConfirmModal';
import AlertModal from '../AlertModal';
import useDemoReset from '../../hooks/useDemoReset';

export default function DemoResetButton({ variant = 'hero' }) {
  const { confirmOpen, setConfirmOpen, busy, alert, setAlert, runReset } = useDemoReset();

  const buttonClass =
    variant === 'hero'
      ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50'
      : 'w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50';

  return (
    <>
      <button
        type="button"
        data-demo="reset-demo-data"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className={buttonClass}
      >
        <FaSyncAlt className={`text-xs ${busy ? 'animate-spin' : ''}`} aria-hidden />
        {busy ? 'Resetting…' : 'Reset demo data'}
      </button>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Reset demo database?"
        message="This restores the demo to its polished seed state — 96 jobs across Houston, Austin, and Dallas. Safe to run between presentations."
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
