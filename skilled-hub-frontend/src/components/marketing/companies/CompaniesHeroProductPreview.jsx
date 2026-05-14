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
    <div className="rounded-xl border border-gray-100 bg-gray-50/90 px-2.5 py-2 sm:px-3 sm:py-2.5">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[10px]">
        <Icon className={`h-3 w-3 shrink-0 ${accent}`} />
        <span className="leading-tight">{label}</span>
      </div>
      <p className="mt-0.5 text-base font-bold tabular-nums text-tf-navy sm:text-lg">{value}</p>
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
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>
  );
}

/**
 * Stylized company-side preview aligned with real TechFlash job lifecycle:
 * post → open → technician claims → company manages (no multi-match marketplace UI).
 */
export function CompaniesHeroProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl min-w-0 lg:max-w-none">
      <div className="pointer-events-none absolute -right-8 -top-6 h-44 w-44 rounded-full bg-tf-orange/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-12 h-40 w-40 rounded-full bg-tf-blue/15 blur-3xl" />

      <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-gray-300/40">
        <div className="flex min-h-[300px] sm:min-h-[340px]">
          <aside className="flex w-10 shrink-0 flex-col items-center gap-3 border-r border-gray-100 bg-tf-navy py-3 sm:w-12 sm:gap-4 sm:py-4">
            <div className="h-7 w-7 rounded-lg bg-white/10 sm:h-8 sm:w-8" />
            <FaChartBar className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" aria-hidden />
            <FaClipboardList className="h-3.5 w-3.5 text-white/50 sm:h-4 sm:w-4" />
            <FaFolderOpen className="h-3.5 w-3.5 text-white/50 sm:h-4 sm:w-4" />
            <FaBriefcase className="h-3.5 w-3.5 text-white/50 sm:h-4 sm:w-4" />
          </aside>
          <div className="min-w-0 flex-1 p-2.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-tf-navy sm:text-sm">Jobs</p>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold text-gray-600 sm:text-[10px]">
                Company view
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-gray-500 sm:text-xs">
              Post work, track open roles, and manage jobs after a technician claims.
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:mt-3 sm:grid-cols-4 sm:gap-2">
              <Metric icon={FaBolt} label="Active" value="12" accent="text-tf-orange" />
              <Metric icon={FaFolderOpen} label="Open" value="3" accent="text-tf-blue" />
              <Metric icon={FaCheckCircle} label="Claimed" value="5" accent="text-amber-600" />
              <Metric icon={FaClipboardList} label="Completed" value="156" accent="text-emerald-700" />
            </div>

            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/50 p-2 sm:mt-4 sm:p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:text-xs">Recent job posts</p>
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full min-w-[280px] text-left text-[10px] sm:text-[11px]">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="pb-1.5 font-semibold">Job</th>
                      <th className="pb-1.5 font-semibold">Trade</th>
                      <th className="pb-1.5 font-semibold">Rate</th>
                      <th className="pb-1.5 font-semibold">Location</th>
                      <th className="pb-1.5 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-tf-navy">
                    <tr className="border-t border-gray-100">
                      <td className="py-1.5 font-semibold leading-snug">Industrial electrician</td>
                      <td className="py-1.5 text-gray-600">Electrical</td>
                      <td className="py-1.5 font-semibold">$65/hr</td>
                      <td className="py-1.5 text-gray-600">Austin, TX</td>
                      <td className="py-1.5 text-right">
                        <StatusBadge tone="open">Open</StatusBadge>
                      </td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-1.5 font-semibold leading-snug">RTU startup &amp; checkout</td>
                      <td className="py-1.5 text-gray-600">HVAC</td>
                      <td className="py-1.5 font-semibold">$52/hr</td>
                      <td className="py-1.5 text-gray-600">Dallas, TX</td>
                      <td className="py-1.5 text-right">
                        <StatusBadge tone="claimed">Claimed</StatusBadge>
                      </td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-1.5 font-semibold leading-snug">Panel swap — overnight</td>
                      <td className="py-1.5 text-gray-600">Electrical</td>
                      <td className="py-1.5 font-semibold">$58/hr</td>
                      <td className="py-1.5 text-gray-600">Houston, TX</td>
                      <td className="py-1.5 text-right">
                        <StatusBadge tone="progress">In progress</StatusBadge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-tf-blue">
                  View job
                </span>
                <span className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-tf-navy">
                  Manage job
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -left-1 top-[10%] z-10 w-[min(100%,12.5rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg sm:left-0 sm:w-52">
        <p className="text-[9px] font-bold uppercase tracking-wide text-tf-blue">Job claimed</p>
        <p className="mt-1 text-[11px] font-bold leading-snug text-tf-navy">RTU startup &amp; checkout</p>
        <p className="mt-1 text-[10px] text-gray-500">Technician: Jordan Lee · HVAC</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tf-blue/15 text-[10px] font-bold text-tf-blue">
            JL
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-tf-navy">Jordan Lee</p>
            <StatusBadge tone="claimed">Claimed</StatusBadge>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="flex-1 rounded-lg bg-tf-blue py-1.5 text-center text-[10px] font-bold text-white">View job</span>
          <span className="flex-1 rounded-lg border border-gray-200 py-1.5 text-center text-[10px] font-bold text-tf-navy">
            Manage job
          </span>
        </div>
      </div>

      <div className="absolute -bottom-2 right-0 z-10 w-[min(100%,12.5rem)] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl sm:-right-1 sm:bottom-1 sm:w-56">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-tf-orange">Open job</p>
        <p className="mt-1 text-[11px] font-bold leading-snug text-tf-navy">Industrial electrician</p>
        <p className="mt-1 text-[10px] text-gray-500">Qualified techs are notified; first claim fills the job.</p>
        <p className="mt-2 text-[10px] font-semibold text-tf-navy">$65/hr · Austin, TX</p>
        <div className="mt-2">
          <StatusBadge tone="open">Open</StatusBadge>
        </div>
      </div>
    </div>
  );
}
