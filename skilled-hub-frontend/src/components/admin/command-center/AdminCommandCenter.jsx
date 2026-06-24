import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildAdminCommandCenterModel } from '../../../data/adminCommandCenterAdapter';
import SettingsTabs from '../../settings/SettingsTabs';
import CommandCenterHeader from './CommandCenterHeader';
import MarketplaceHealthCard from './MarketplaceHealthCard';
import MarketplaceFunnel from './MarketplaceFunnel';
import CommandCenterBody from './CommandCenterBody';
import KpiCard from './KpiCard';
import DemoWelcomeHero from '../../demo/DemoWelcomeHero';
import { isDemoMode } from '../../../utils/demoMode';

function SkeletonBar({ className }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/90 ${className}`} />;
}

function LoadingShell() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 space-y-3">
          <SkeletonBar className="h-6 w-48" />
          <SkeletonBar className="h-4 max-w-xl" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonBar key={i} className="h-7 w-14" />
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBar key={i} className="h-10" />
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 max-w-[100rem] mx-auto w-full">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white min-h-[5.25rem] p-3 animate-pulse">
            <SkeletonBar className="h-2 w-20 mb-2" />
            <SkeletonBar className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch max-w-[100rem] mx-auto w-full">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white min-h-[22rem] p-4 space-y-3">
          <SkeletonBar className="h-4 w-40" />
          <SkeletonBar className="h-10 w-24" />
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBar key={i} className="h-2 w-full" />
          ))}
        </div>
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white min-h-[22rem] p-4 space-y-2">
          <SkeletonBar className="h-4 w-36" />
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} className="h-12 w-full max-w-full" />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 max-w-[100rem] mx-auto w-full">
        <SkeletonBar className="h-4 w-32 mb-3" />
        <SkeletonBar className="h-40 w-full" />
      </div>
    </div>
  );
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
  onStartTour,
}) {
  const model = useMemo(() => {
    if (!analytics && !(insightsByCategory && Object.keys(insightsByCategory).length)) return null;
    return buildAdminCommandCenterModel({
      analytics,
      insightsByCategory: insightsByCategory || {},
      feedbackList: feedbackList || [],
      conversations: conversations || [],
      filters,
    });
  }, [analytics, insightsByCategory, feedbackList, conversations, filters]);
  const [dashboardTab, setDashboardTab] = React.useState('overview');
  const dashboardTabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'operations', label: 'Operations' },
      { id: 'feedback', label: 'Feedback' },
    ],
    []
  );
  const [operationsSubTab, setOperationsSubTab] = React.useState('liquidity');
  const operationsSubTabs = useMemo(
    () => [
      { id: 'liquidity', label: 'Liquidity' },
      { id: 'ops', label: 'Job ops' },
      { id: 'demand', label: 'Companies' },
      { id: 'matching', label: 'Matching/revenue' },
      { id: 'markets', label: 'Markets/queue' },
    ],
    []
  );

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-4 text-red-950 max-w-2xl">
        <p className="text-sm font-semibold">Could not load command center</p>
        <p className="text-xs mt-1 text-red-900/90 leading-relaxed">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !model) {
    return <LoadingShell />;
  }

  return (
    <div className="space-y-4 max-w-[100rem] mx-auto w-full">
      {isDemoMode() && onStartTour && (
        <DemoWelcomeHero analytics={analytics} onStartTour={onStartTour} />
      )}
      {dataError && !isDemoMode() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">Partial load.</span> {dataError} Some charts or tables may be incomplete until refresh succeeds.
        </div>
      )}
      <CommandCenterHeader
        filters={filters}
        onChange={onFiltersChange}
        lastUpdatedMs={lastUpdatedMs}
        onRefresh={onRefresh}
        refreshing={refreshing}
        demoMode={isDemoMode()}
      />
      <section className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden" aria-label="Admin dashboard sections">
        <SettingsTabs tabs={dashboardTabs} activeId={dashboardTab} onChange={setDashboardTab} ariaLabel="Admin dashboard sections" />
        <div className="p-3 sm:p-4">
          {dashboardTab === 'overview' && (
            <div id="settings-panel-overview" role="tabpanel" aria-labelledby="settings-tab-overview" className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2" data-demo="admin-dashboard-stats">
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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <MarketplaceHealthCard health={model.health} />
                <MarketplaceFunnel funnel={model.funnel} />
              </div>
            </div>
          )}
          {dashboardTab === 'operations' && (
            <div id="settings-panel-operations" role="tabpanel" aria-labelledby="settings-tab-operations">
              <div className="mb-4">
                <SettingsTabs
                  tabs={operationsSubTabs}
                  activeId={operationsSubTab}
                  onChange={setOperationsSubTab}
                  ariaLabel="Operations sub-sections"
                />
              </div>
              <CommandCenterBody model={model} section={operationsSubTab} />
            </div>
          )}
          {dashboardTab === 'feedback' && (
            <section id="settings-panel-feedback" role="tabpanel" aria-labelledby="settings-tab-feedback">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">User feedback</h2>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                Submissions from the in-app feedback widget (also visible in Messages for admins).
              </p>
              {!feedbackList?.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-xs text-slate-500">
                  No feedback submissions for this workspace.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto max-h-[min(44vh,20rem)] overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-xs">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">When</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">From</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Type</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {feedbackList.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/80">
                            <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap align-top">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-slate-800 align-top">{row.user_email || '—'}</td>
                            <td className="px-3 py-1.5 capitalize text-slate-700 align-top">{row.kind || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-800 whitespace-pre-wrap max-w-xl align-top">{row.body}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pb-2">
        <Link
          to="/crm"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          Company CRM
        </Link>
        <Link
          to="/jobs"
          className="inline-flex items-center rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          View all jobs
        </Link>
      </div>

    </div>
  );
}
