import React, { useMemo, useState } from 'react';

export default function DataTable({
  title,
  subtitle,
  columns,
  rows,
  emptyMessage = 'No rows',
  maxHeight = 'min(24rem, 50vh)',
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

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full sm:w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
        />
      </div>
      <div className="overflow-x-auto" style={{ maxHeight }}>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!filtered.length ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={row.id ?? idx} className="hover:bg-slate-50/80">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2 text-slate-800 whitespace-nowrap max-w-[14rem] truncate">
                      {col.render ? col.render(row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
