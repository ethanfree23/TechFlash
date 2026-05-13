import React, { useMemo } from 'react';
import { FaCommentDots } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { buildAdminCommandCenterModel, mergeMockSupplements } from '../../../data/adminCommandCenterAdapter';
import { getMockAdminSupplements } from '../../../data/adminCommandCenterMock';
import CommandCenterHeader from './CommandCenterHeader';
import MarketplaceHealthCard from './MarketplaceHealthCard';
import MarketplaceFunnel from './MarketplaceFunnel';
import CommandCenterBody from './CommandCenterBody';
import KpiCard from './KpiCard';

function SkeletonCard() {
  return <div className="rounded-2xl border border-slate-200 bg-white h-28 animate-pulse bg-slate-100" />;
}

export default function AdminCommandCenter({
  analytics,
  insightsByCategory,
  feedbackList,
  conversations,
  filters,
  onFiltersChange,
  loading,
  error,
  dataError,
  onRetry,
  lastUpdatedMs,
  refreshing,
  onRefresh,
}) {
  const model = useMemo(() => {
    if (!analytics && !(insightsByCategory && Object.keys(insightsByCategory).length)) return null;
    const base = buildAdminCommandCenterModel({
      analytics,
      insightsByCategory: insightsByCategory || {},
      feedbackList: feedbackList || [],
      conversations: conversations || [],
      filters,
    });
    return mergeMockSupplements(base, getMockAdminSupplements());
  }, [analytics, insightsByCategory, feedbackList, conversations, filters]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
        <p className="font-semibold">Dashboard data could not be loaded</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !model) {
    return (
      <div className="space-y-6">
        <div className="h-40 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dataError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="font-semibold">Partial load:</strong> {dataError} Charts may be incomplete until refresh succeeds.
        </div>
      )}
      <CommandCenterHeader
        filters={filters}
        onChange={onFiltersChange}
        lastUpdatedMs={lastUpdatedMs}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {(model.kpis || []).map((k) => (
          <KpiCard
            key={k.id}
            label={k.label}
            value={k.value}
            delta={k.delta}
            spark={k.spark}
            tone={k.tone}
            footnote={k.footnote}
            format={k.format}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <MarketplaceHealthCard health={model.health} />
        <MarketplaceFunnel funnel={model.funnel} />
      </div>

      <CommandCenterBody model={model} />

      <section className="border-t border-slate-200 pt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <FaCommentDots className="text-[#FE6711]" /> User feedback
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Messages from the Feedback widget (also in Messages for admins).
        </p>
        {!feedbackList?.length ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500 text-sm">
            No feedback submissions.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[min(50vh,24rem)] overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">When</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">From</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feedbackList.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-800">{row.user_email || '—'}</td>
                      <td className="px-4 py-2 capitalize text-slate-700">{row.kind || '—'}</td>
                      <td className="px-4 py-2 text-slate-800 whitespace-pre-wrap max-w-xl">{row.body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3 pb-8">
        <Link
          to="/crm"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 text-sm font-semibold"
        >
          Company CRM
        </Link>
        <Link
          to="/jobs"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold"
        >
          View all jobs
        </Link>
      </div>
    </div>
  );
}
