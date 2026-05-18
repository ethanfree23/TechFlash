import React from 'react';

function CardSkeleton() {
  return (
    <div className="flex h-full min-h-[22rem] flex-col rounded-xl border border-l-[3px] border-l-slate-200 border-slate-200/90 bg-white shadow-sm animate-pulse overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex justify-between gap-2">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="h-5 bg-slate-200 rounded-full w-14" />
        </div>
      </div>
      <div className="flex-1 px-4 py-3 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-5/6" />
        <div className="h-3 bg-slate-100 rounded w-2/3 mt-4" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
      </div>
      <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="col-span-2 h-8 bg-slate-200 rounded-lg" />
          <div className="h-8 bg-slate-100 rounded-lg" />
          <div className="h-8 bg-slate-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 bg-slate-100 rounded w-full max-w-[7rem]" />
        </td>
      ))}
    </tr>
  );
}

export default function JobLoadingSkeleton({ viewMode = 'card' }) {
  if (viewMode === 'table') {
    return (
      <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
      {Array.from({ length: 6 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
