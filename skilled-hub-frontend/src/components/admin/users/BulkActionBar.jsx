import React from 'react';
import { FaEnvelope, FaFileExport, FaSms, FaTag, FaTimes, FaTrash, FaUserCheck } from 'react-icons/fa';

export default function BulkActionBar({ selectedCount, onClear, onExport, onSendEmail, onResetPassword, onDelete, onPlaceholderAction }) {
  if (selectedCount <= 0) return null;

  const btn =
    'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 transition-colors';

  const placeholder = (label) => () => onPlaceholderAction?.(label);

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white/95 backdrop-blur-sm px-3 py-2 shadow-lg ring-1 ring-black/5">
        <span className="text-xs font-semibold text-slate-800 tabular-nums">{selectedCount} selected</span>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={onSendEmail} className={btn}>
            <FaEnvelope className="w-3 h-3" /> Email
          </button>
          <button type="button" onClick={placeholder('Send SMS')} className={btn}>
            <FaSms className="w-3 h-3" /> SMS
          </button>
          <button type="button" onClick={placeholder('Assign tag')} className={btn}>
            <FaTag className="w-3 h-3" /> Tag
          </button>
          <button type="button" onClick={onExport} className={btn}>
            <FaFileExport className="w-3 h-3" /> Export
          </button>
          <button type="button" onClick={onResetPassword} className={btn}>
            <FaUserCheck className="w-3 h-3" /> Reset pwd
          </button>
          <button type="button" onClick={placeholder('Verify selected')} className={btn}>
            Verify
          </button>
          <button type="button" onClick={placeholder('Suspend selected')} className={btn}>
            Suspend
          </button>
          <button type="button" onClick={onDelete} className={`${btn} border-red-200/80 text-red-600 hover:bg-red-50`}>
            <FaTrash className="w-3 h-3" /> Delete
          </button>
          <button type="button" onClick={onClear} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Clear selection">
            <FaTimes className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
