import React, { useMemo, useState } from 'react';

export default function DataTable({
  title,
  subtitle,
  columns,
  rows,
  emptyMessage = 'No rows',
  maxHeight = 'min(22rem, 48vh)',
  dense = false,
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q.trim()) return rows || [];
    const n = q.trim().toLowerCase();
    return (rows || []).filter((r) =>
      columns.some((col) => String(r[col.key] ?? '')
        .toLowerCase()
        .includes(n))
    );
  }, [rows, columns, q]);

  const cellPad = dense ? 'px-2 py-1.5' : 'px-3 py-2';
  const bodyText = dense ? 'text-xs' : 'text-sm';
  const headText = dense ? 'text-[10px]' : 'text-[11px]';

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className={`font-semibold text-slate-900 ${dense ? 'text-xs' : 'text-sm'}`}>{title}</h3>
          {subtitle && <p className={`text-slate-500 mt-0.5 ${dense ? 'text-[10px] leading-snug' : 'text-xs'}`}>{subtitle}</p>}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter rows…"
          className={`w-full sm:w-40 rounded-md border border-slate-200 px-2 py-1 focus:ring-1 focus:ring-slate-300 focus:border-slate-300 ${dense ? 'text-xs' : 'text-sm'}`}
        />
      </div>
      <div className="overflow-x-auto overscroll-x-contain" style={{ maxHeight }}>
        <table className={`min-w-full divide-y divide-slate-100 ${bodyText}`}>
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${cellPad} text-left ${headText} font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!filtered.length ? (
              <tr>
                <td colSpan={columns.length} className={`${cellPad} py-8 text-center text-slate-500 ${dense ? 'text-xs' : 'text-sm'}`}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={row.id ?? idx} className="hover:bg-slate-50/90">
                  {columns.map((col) => {
                    const extra = col.cellClassName || 'whitespace-nowrap max-w-[14rem] truncate';
                    return (
                      <td key={col.key} className={`${cellPad} text-slate-800 ${extra}`}>
                        {col.render ? col.render(row) : row[col.key] ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
