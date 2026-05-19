import React from 'react';
import { Link } from 'react-router-dom';
import { FaMapMarkerAlt, FaPlay, FaStar } from 'react-icons/fa';
import { getDemoFlagshipJobId } from '../../utils/demoMode';

const CITY_STATS = [
  { city: 'Houston', jobs: 32 },
  { city: 'Austin', jobs: 32 },
  { city: 'Dallas', jobs: 32 },
];

export default function DemoWelcomeHero({ analytics, onStartTour }) {
  const flagshipId = getDemoFlagshipJobId();
  const totalJobs = analytics?.total_jobs ?? 96;

  return (
    <section
      data-demo="demo-welcome-hero"
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-lg"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(254,103,17,0.18),transparent_55%)]" aria-hidden />
      <div className="relative p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-300/90">
              Live marketplace demo
            </p>
            <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight">
              Skilled trades across Texas
            </h2>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl leading-relaxed">
              {totalJobs} realistic jobs, active companies, and technicians across Houston, Austin, and Dallas —
              ready for a guided walkthrough.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {CITY_STATS.map(({ city, jobs }) => (
                <span
                  key={city}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100"
                >
                  <FaMapMarkerAlt className="text-orange-300/90 text-[10px]" aria-hidden />
                  {city}
                  <span className="text-slate-400">·</span>
                  <span className="tabular-nums text-white">{jobs} jobs</span>
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            data-demo="walkthrough-start"
            onClick={onStartTour}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#FE6711] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-95"
          >
            <FaPlay className="text-xs" aria-hidden />
            Start Demo
          </button>
        </div>

        {flagshipId && (
          <Link
            to={`/jobs/${flagshipId}`}
            data-demo="featured-job-callout"
            className="mt-5 flex items-start gap-3 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 hover:bg-orange-500/15 transition-colors"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/20 text-orange-200">
              <FaStar className="text-sm" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-orange-200/90">
                Featured job
              </span>
              <span className="block text-sm font-semibold text-white mt-0.5">
                URGENT: Commercial RTU coverage — Midtown Houston
              </span>
              <span className="block text-xs text-orange-100/80 mt-0.5">
                $72/hr · EPA-certified HVAC · Claimed and in coordination
              </span>
            </span>
          </Link>
        )}

        <p className="mt-4 text-xs text-slate-400">
          Switch roles or reset demo data in{' '}
          <Link to="/settings?tab=account" className="text-orange-200 hover:text-white underline underline-offset-2">
            Settings → Account → Account role
          </Link>
          .
        </p>
      </div>
    </section>
  );
}


