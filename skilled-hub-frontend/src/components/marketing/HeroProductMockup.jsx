import React from 'react';
import {
  FaBolt,
  FaBriefcase,
  FaChartBar,
  FaCheckCircle,
  FaClipboardList,
  FaFolderOpen,
} from 'react-icons/fa';

function Metric({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        <Icon className={`h-3 w-3 ${accent}`} />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-tf-navy">{value}</p>
    </div>
  );
}

function StatusBadge({ children, tone }) {
  const tones = {
    open: 'bg-blue-100 text-blue-800',
    claimed: 'bg-amber-100 text-amber-900',
    progress: 'bg-emerald-100 text-emerald-900',
    done: 'bg-green-200 text-green-900',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function JobRow({ title, trade, rate, status, tone }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-tf-navy">{title}</p>
        <p className="truncate text-[11px] text-gray-500">
          {trade} · {rate}
        </p>
      </div>
      <StatusBadge tone={tone}>{status}</StatusBadge>
    </div>
  );
}

export function HeroProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-xl min-w-0 lg:max-w-none">
      <div className="pointer-events-none absolute -right-6 -top-4 h-40 w-40 rounded-full bg-tf-orange/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-10 h-36 w-36 rounded-full bg-tf-blue/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xl shadow-gray-200/50">
        <div className="flex min-h-[320px] sm:min-h-[360px]">
          <aside className="flex w-11 shrink-0 flex-col items-center gap-4 bg-tf-navy py-4 sm:w-14">
            <div className="h-8 w-8 rounded-lg bg-white/10" />
            <FaClipboardList className="h-4 w-4 text-white/70" aria-hidden />
            <FaChartBar className="h-4 w-4 text-white/40" aria-hidden />
            <FaBolt className="h-4 w-4 text-white/40" aria-hidden />
          </aside>
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-tf-navy sm:text-sm">Company dashboard</p>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Live</span>
            </div>
            <p className="mt-0.5 text-[10px] text-gray-500 sm:text-[11px]">
              Jobs move from open → claimed → in progress → completed.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric icon={FaBolt} label="Active" value="12" accent="text-tf-orange" />
              <Metric icon={FaFolderOpen} label="Open" value="3" accent="text-tf-blue" />
              <Metric icon={FaCheckCircle} label="Claimed" value="5" accent="text-amber-600" />
              <Metric icon={FaBriefcase} label="Completed" value="142" accent="text-emerald-700" />
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-3">
              <p className="text-xs font-bold text-tf-navy">Recent jobs</p>
              <JobRow title="Commercial HVAC — RTU inspection" trade="HVAC" rate="$42/hr" status="Claimed" tone="claimed" />
              <JobRow title="Industrial electrical — panel swap" trade="Electrical" rate="$55/hr" status="Open" tone="open" />
              <JobRow title="Plumbing — booster pump" trade="Plumbing" rate="$38/hr" status="In progress" tone="progress" />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -left-2 top-[8%] z-10 w-[min(100%,12rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg sm:left-0 sm:w-52">
        <p className="text-[10px] font-bold uppercase tracking-wide text-tf-blue">Claimed technician</p>
        <p className="mt-1 text-xs font-bold leading-snug text-tf-navy">Marcus Cole</p>
        <p className="mt-0.5 text-[10px] text-gray-500">Commercial HVAC — RTU inspection</p>
        <div className="mt-2">
          <StatusBadge tone="claimed">Claimed</StatusBadge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="rounded-lg border border-gray-200 py-1.5 text-center text-[10px] font-bold text-tf-blue">View job</span>
          <span className="rounded-lg bg-tf-navy py-1.5 text-center text-[10px] font-bold text-white">Manage job</span>
        </div>
      </div>

      <div className="absolute -bottom-3 right-0 z-10 w-[min(100%,13rem)] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl sm:-right-2 sm:bottom-2 sm:w-52">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tf-orange">Open job</p>
        <p className="mt-1 text-xs font-bold leading-snug text-tf-navy">Industrial electrical — panel swap</p>
        <p className="mt-1 text-[11px] text-gray-500">Qualified techs are notified; first claim fills the job.</p>
        <div className="mt-2">
          <StatusBadge tone="open">Open</StatusBadge>
        </div>
      </div>
    </div>
  );
}
