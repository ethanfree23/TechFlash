import React from 'react';

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 min-h-[4.5rem] animate-pulse">
          <div className="h-2 w-14 bg-slate-100 rounded" />
          <div className="mt-1.5 h-5 w-10 bg-slate-200 rounded" />
          <div className="mt-1 h-2 w-20 bg-slate-50 rounded" />
        </div>
      ))}
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white p-2 animate-pulse mb-3">
      <div className="h-8 bg-slate-50 rounded-md" />
    </div>
  );
}

export function TableRowsSkeleton({ rows = 8 }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
          <div className="h-3.5 w-3.5 bg-slate-100 rounded shrink-0" />
          <div className="h-8 w-8 bg-slate-200 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <div className="h-3 w-28 bg-slate-200 rounded" />
            <div className="h-2.5 w-40 bg-slate-100 rounded" />
          </div>
          <div className="h-4 w-14 bg-slate-100 rounded-full hidden sm:block" />
          <div className="h-4 w-12 bg-slate-100 rounded-full hidden md:block" />
        </div>
      ))}
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="h-12 w-12 bg-slate-200 rounded-full shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="h-3 w-48 bg-slate-100 rounded" />
          <div className="h-2.5 w-32 bg-slate-50 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-slate-50 rounded-lg border border-slate-100" />
        ))}
      </div>
      <div className="h-16 bg-slate-50 rounded-lg border border-slate-100" />
      <div className="h-24 bg-slate-50 rounded-lg border border-slate-100" />
    </div>
  );
}
