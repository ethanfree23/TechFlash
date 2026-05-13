import React, { useState } from 'react';

const MAX_LINES = 6;

export default function CrmBioReadMore({ text, className = '' }) {
  const [open, setOpen] = useState(false);
  const s = String(text || '').trim();
  if (!s) return <span className="text-sm text-slate-400">—</span>;
  const lines = s.split('\n');
  const long = lines.length > MAX_LINES || s.length > 480;
  const shown = !long || open ? s : lines.slice(0, MAX_LINES).join('\n').slice(0, 480) + (s.length > 480 ? '…' : '');
  return (
    <div className={className}>
      <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{shown}</p>
      {long && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
