import React from 'react';
import { FaMapMarkerAlt } from 'react-icons/fa';

function PhoneFrame({ children }) {
  return (
    <div className="relative mx-auto w-[min(100%,15.5rem)] shrink-0">
      <div className="absolute inset-x-6 top-2 h-5 rounded-full bg-black/80" />
      <div className="overflow-hidden rounded-[1.75rem] border-[6px] border-gray-800 bg-white shadow-2xl">
        <div className="max-h-[22rem] overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function StatusPill({ children, tone }) {
  const map = {
    open: 'bg-blue-100 text-blue-800',
    claimed: 'bg-amber-100 text-amber-900',
    done: 'bg-emerald-100 text-emerald-900',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${map[tone]}`}>{children}</span>;
}

/**
 * Stylized technician preview: open job detail (claim), My Jobs summary, lightweight activity strip.
 * Illustrative only — not live data.
 */
export function TechniciansHeroProductPreview() {
  return (
    <div className="relative mx-auto flex w-full max-w-xl min-w-0 flex-col items-center gap-8 lg:max-w-none lg:flex-row lg:items-start lg:justify-center lg:gap-6">
      <div className="relative z-10 hidden w-full max-w-[17rem] rounded-2xl border border-white/10 bg-white/95 p-3 shadow-xl lg:block lg:max-w-[18rem]">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">My jobs</p>
        <div className="mt-2 flex gap-1 rounded-lg bg-gray-100 p-0.5 text-[9px] font-bold text-gray-600">
          <span className="flex-1 rounded-md bg-white py-1 text-center text-tf-navy shadow-sm">Upcoming (2)</span>
          <span className="flex-1 py-1 text-center">In progress (1)</span>
          <span className="flex-1 py-1 text-center">Completed (6)</span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-2">
            <p className="text-[11px] font-bold text-tf-navy">HVAC service technician</p>
            <p className="text-[9px] text-gray-500">Commercial · Tomorrow 7:00 AM</p>
            <div className="mt-1 flex items-center justify-between">
              <StatusPill tone="claimed">Claimed</StatusPill>
              <span className="text-[10px] font-bold text-tf-navy">$55/hr</span>
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 px-2 py-2">
            <p className="text-[11px] font-bold text-tf-navy">Industrial electrician</p>
            <p className="text-[9px] text-gray-500">Open · Today 2:00 PM</p>
            <div className="mt-1">
              <StatusPill tone="open">Open</StatusPill>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-white px-2 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Activity</p>
          <p className="mt-1 text-[10px] text-gray-600">Completed jobs trend (illustrative)</p>
          <div className="mt-2 flex h-10 items-end gap-1">
            {[40, 55, 35, 70, 45, 60, 50].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-tf-orange/50" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>

      <PhoneFrame>
        <div className="bg-gray-50 p-3 pb-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-tf-navy">Job details</span>
            <StatusPill tone="open">Open</StatusPill>
          </div>
          <p className="mt-2 text-sm font-extrabold leading-snug text-tf-navy">HVAC service technician</p>
          <p className="mt-1 text-[10px] text-gray-600">Commercial · Dallas, TX</p>
          <div className="mt-3 space-y-1.5 text-[10px] text-gray-700">
            <p>
              <span className="font-semibold text-gray-500">Rate:</span> $55/hr
            </p>
            <p>
              <span className="font-semibold text-gray-500">Starts:</span> Wed, May 21 · 7:00 AM
            </p>
            <p>
              <span className="font-semibold text-gray-500">Est. length:</span> 6 hours
            </p>
            <p className="leading-snug text-gray-600">
              Rooftop package unit PM, filter change, belt inspection, and basic electrical checks.
            </p>
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-tf-orange py-2.5 text-xs font-bold text-white shadow-md"
            tabIndex={-1}
          >
            Claim job
          </button>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-gray-200 py-2 text-[10px] font-bold text-tf-blue"
            tabIndex={-1}
          >
            <FaMapMarkerAlt className="h-3 w-3" aria-hidden />
            View on map
          </button>
        </div>
      </PhoneFrame>

      <div className="relative z-10 w-full max-w-[17rem] rounded-2xl border border-white/10 bg-white/95 p-3 shadow-xl lg:hidden">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">My jobs</p>
        <div className="mt-2 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-0.5 text-[9px] font-bold text-gray-600">
          <span className="shrink-0 rounded-md bg-white px-2 py-1 text-tf-navy shadow-sm">Upcoming (2)</span>
          <span className="shrink-0 px-2 py-1">In progress (1)</span>
          <span className="shrink-0 px-2 py-1">Completed (6)</span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-2">
            <p className="text-[11px] font-bold text-tf-navy">HVAC service technician</p>
            <p className="text-[9px] text-gray-500">Claimed</p>
          </div>
          <div className="rounded-lg border border-gray-100 px-2 py-2">
            <p className="text-[11px] font-bold text-tf-navy">Industrial electrician</p>
            <p className="text-[9px] text-gray-500">Open</p>
          </div>
        </div>
      </div>
    </div>
  );
}
