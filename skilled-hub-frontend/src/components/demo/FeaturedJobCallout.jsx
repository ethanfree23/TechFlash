import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaStar } from 'react-icons/fa';
import { getDemoFlagshipJobId, isDemoMode } from '../../utils/demoMode';

export default function FeaturedJobCallout() {
  if (!isDemoMode()) return null;

  const flagshipId = getDemoFlagshipJobId();
  if (!flagshipId) return null;

  return (
    <Link
      to={`/jobs/${flagshipId}`}
      data-demo="featured-job-callout"
      className="mb-4 flex items-center gap-3 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 hover:border-orange-300 transition-colors group"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
        <FaStar className="text-sm" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-orange-700">
          Featured job · Houston
        </span>
        <span className="block text-sm font-semibold text-slate-900 truncate">
          URGENT: Commercial RTU coverage — Midtown Houston
        </span>
        <span className="block text-xs text-slate-600 mt-0.5">
          $72/hr · 2 days · EPA-certified HVAC technician needed tomorrow
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 shrink-0 group-hover:gap-1.5 transition-all">
        View job
        <FaArrowRight className="text-[10px]" aria-hidden />
      </span>
    </Link>
  );
}
