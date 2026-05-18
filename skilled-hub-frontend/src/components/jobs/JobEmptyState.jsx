import React from 'react';
import { Link } from 'react-router-dom';
import { FaBriefcase, FaFilter, FaInbox, FaSearch, FaWrench } from 'react-icons/fa';

const VARIANT_CONFIG = {
  admin: {
    no_jobs: { icon: FaBriefcase, accent: 'border-blue-200 bg-blue-50/30' },
    no_match: { icon: FaFilter, accent: 'border-slate-200 bg-slate-50/50' },
  },
  company: {
    no_jobs: { icon: FaInbox, accent: 'border-blue-200 bg-blue-50/30' },
    no_match: { icon: FaFilter, accent: 'border-slate-200 bg-slate-50/50' },
  },
  technician: {
    no_jobs: { icon: FaWrench, accent: 'border-orange-200 bg-orange-50/30' },
    no_match: { icon: FaSearch, accent: 'border-slate-200 bg-slate-50/50' },
  },
};

export default function JobEmptyState({ variant = 'no_jobs', config, role = 'technician', onClearFilters, onRetry }) {
  const emptyConfig = variant === 'no_match' ? config?.emptyNoMatch : config?.emptyNoJobs;
  const style = VARIANT_CONFIG[role]?.[variant] || VARIANT_CONFIG.technician.no_jobs;
  const Icon = variant === 'error' ? FaSearch : style.icon;

  if (variant === 'error') {
    return (
      <div className="rounded-xl border border-red-200/80 bg-red-50/40 px-6 py-10 text-center">
        <Icon className="mx-auto h-8 w-8 text-red-400 mb-3" aria-hidden />
        <p className="text-base font-semibold text-red-900 mb-1">Unable to load jobs</p>
        <p className="text-sm text-red-700/90 mb-4">Something went wrong while fetching job data.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border px-6 py-12 text-center shadow-sm ${style.accent}`}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-200/80 shadow-sm">
        <Icon className="h-5 w-5 text-slate-400" aria-hidden />
      </div>
      <p className="text-base font-semibold text-slate-900 mb-1.5">{emptyConfig?.title || 'No jobs found'}</p>
      <p className="text-sm text-slate-600 max-w-sm mx-auto mb-5 leading-relaxed">{emptyConfig?.message}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {variant === 'no_match' && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
        {variant === 'no_jobs' && emptyConfig?.actionTo && (
          <Link
            to={emptyConfig.actionTo}
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            {emptyConfig.actionLabel || 'Create Job'}
          </Link>
        )}
      </div>
    </div>
  );
}
