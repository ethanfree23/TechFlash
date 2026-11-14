import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaSyncAlt, FaShieldAlt } from 'react-icons/fa';
import AppHeader from '../components/AppHeader';
import AppFooter from '../components/layout/AppFooter';
import { adminTrustSafetyAPI } from '../api/api';
import { useToast } from '../components/messages/useToast';
import MessagesToast from '../components/messages/MessagesToast';
import TrustSafetyMetrics from '../components/admin/trust-safety/TrustSafetyMetrics';
import TrustSafetyTabs from '../components/admin/trust-safety/TrustSafetyTabs';
import QueueFilters from '../components/admin/trust-safety/QueueFilters';
import ReviewQueueTable from '../components/admin/trust-safety/ReviewQueueTable';
import ReviewDrawer from '../components/admin/trust-safety/ReviewDrawer';
import BulkActionBar from '../components/admin/trust-safety/BulkActionBar';
import TechniciansTable, { TechnicianFilters } from '../components/admin/trust-safety/TechniciansTable';
import ActivityFeed from '../components/admin/trust-safety/ActivityFeed';
import TrustProfileChecklist from '../components/admin/trust-safety/TrustProfileChecklist';
import { TechnicianCell, Kbd } from '../components/admin/trust-safety/primitives';
import {
  parseWorkspaceSearch,
  buildWorkspaceSearch,
  applyMetricFilter,
  isQueueTab,
  defaultStatusForTab,
  reviewTypeForTab,
  DEFAULT_QUEUE_FILTERS,
  nextPendingKey,
  stepKey,
  isBulkSelectable,
  formatRelative,
} from '../utils/trustSafety';

const METRIC_FOR_STATE = (tab, filters, verification) => {
  if (tab === 'technicians') return verification === 'verified' ? 'verified_technicians' : null;
  if (!isQueueTab(tab)) return null;
  const { status, review_type: rt } = filters;
  if (status === 'needs_review' && rt === 'all') return 'needs_review';
  if (status === 'pending' && rt === 'background_check') return 'background_checks_pending';
  if (status === 'needs_review' && rt === 'credential') return 'credentials_awaiting_review';
  if (status === 'needs_review' && rt === 'reference') return 'references_awaiting_review';
  if (status === 'flagged') return 'flagged';
  if (status === 'expired') return 'expiring_credentials';
  return null;
};

export default function AdminTrustSafetyPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useMemo(() => parseWorkspaceSearch(location.search), [location.search]);
  const { tab, filters, item: openItemKey, technician: technicianId, verification } = workspace;
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast();

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const [queue, setQueue] = useState(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const queueAbort = useRef(null);

  const [directory, setDirectory] = useState(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [directoryFilters, setDirectoryFilters] = useState({ q: '', trade: '', state: '', sort: 'name', page: 1, per_page: 25 });
  const directoryAbort = useRef(null);

  const [checkedKeys, setCheckedKeys] = useState(() => new Set());
  const [selectedKey, setSelectedKey] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // ---------------------------------------------------------------------------
  // URL state helpers
  // ---------------------------------------------------------------------------
  const setWorkspace = useCallback(
    (next, { replace = false } = {}) => {
      const merged = { tab, filters, item: openItemKey, technician: technicianId, verification, ...next };
      navigate({ pathname: location.pathname, search: buildWorkspaceSearch(merged) }, { replace });
    },
    [navigate, location.pathname, tab, filters, openItemKey, technicianId, verification]
  );

  const changeTab = (nextTab) => {
    if (nextTab === tab) return;
    setCheckedKeys(new Set());
    setWorkspace({
      tab: nextTab,
      item: null,
      filters: { ...DEFAULT_QUEUE_FILTERS, status: defaultStatusForTab(nextTab), review_type: reviewTypeForTab(nextTab, 'all') },
      verification: 'all',
    });
  };

  const changeFilters = (patch) => {
    setCheckedKeys(new Set());
    setWorkspace({ filters: { ...filters, ...patch } });
  };

  const resetFilters = () => {
    setCheckedKeys(new Set());
    setWorkspace({ filters: { ...DEFAULT_QUEUE_FILTERS, status: defaultStatusForTab(tab), review_type: reviewTypeForTab(tab, 'all') }, technician: null });
  };

  const openItem = useCallback((key) => setWorkspace({ item: key }), [setWorkspace]);
  const closeItem = useCallback(() => setWorkspace({ item: null }), [setWorkspace]);

  const openTechnician = (userId) => {
    setWorkspace({ tab: 'queue', technician: userId, item: null, filters: { ...DEFAULT_QUEUE_FILTERS, status: 'all' } });
  };

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      setSummary(await adminTrustSafetyAPI.summary());
      setLastRefreshed(new Date().toISOString());
    } catch (e) {
      setSummaryError(e?.message || 'Could not load summary.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    if (!isQueueTab(tab)) return;
    queueAbort.current?.abort();
    const controller = new AbortController();
    queueAbort.current = controller;
    setQueueLoading(true);
    setQueueError('');
    try {
      const res = await adminTrustSafetyAPI.queue({ ...filters, technician_user_id: technicianId || undefined }, { signal: controller.signal });
      setQueue(res);
    } catch (e) {
      if (e?.name !== 'AbortError') setQueueError(e?.message || 'Could not load the review queue.');
    } finally {
      if (!controller.signal.aborted) setQueueLoading(false);
    }
  }, [tab, filters, technicianId]);

  const loadDirectory = useCallback(async () => {
    if (tab !== 'technicians') return;
    directoryAbort.current?.abort();
    const controller = new AbortController();
    directoryAbort.current = controller;
    setDirectoryLoading(true);
    setDirectoryError('');
    try {
      const res = await adminTrustSafetyAPI.technicians({ ...directoryFilters, verification }, { signal: controller.signal });
      setDirectory(res);
    } catch (e) {
      if (e?.name !== 'AbortError') setDirectoryError(e?.message || 'Could not load technicians.');
    } finally {
      if (!controller.signal.aborted) setDirectoryLoading(false);
    }
  }, [tab, directoryFilters, verification]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshToken]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, refreshToken]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory, refreshToken]);

  const refreshAll = () => setRefreshToken((n) => n + 1);

  const items = useMemo(() => queue?.items || [], [queue]);

  // Keep row highlight in sync with drawer.
  useEffect(() => {
    if (openItemKey) setSelectedKey(openItemKey);
  }, [openItemKey]);

  // Drop checked keys that left the page.
  useEffect(() => {
    setCheckedKeys((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(items.filter(isBulkSelectable).map((it) => it.key));
      const next = new Set([...prev].filter((k) => present.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation (list level). Drawer has its own handler.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isQueueTab(tab)) return undefined;
    const onKey = (e) => {
      if (openItemKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const next = stepKey(items, selectedKey, e.key === 'j' ? 1 : -1);
        if (next) {
          setSelectedKey(next);
          document.querySelector(`[data-item-key="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter' && selectedKey) {
        openItem(selectedKey);
      } else if (e.key === 'n') {
        const next = nextPendingKey(items, selectedKey);
        if (next) openItem(next);
      } else if (e.key === '/') {
        e.preventDefault();
        document.querySelector('input[aria-label="Search technicians"]')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tab, items, selectedKey, openItemKey, openItem]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const activeMetric = METRIC_FOR_STATE(tab, filters, verification);
  const tabCounts = useMemo(() => {
    if (!summary) return {};
    return {
      queue: summary.needs_review?.value,
      background_checks: summary.needs_review?.breakdown?.background_checks,
      credentials: summary.credentials_awaiting_review?.value,
      references: summary.references_awaiting_review?.value,
    };
  }, [summary]);

  const checkedItems = items.filter((it) => checkedKeys.has(it.key));
  const openIndex = items.findIndex((it) => it.key === openItemKey);
  const hasNextPending = Boolean(nextPendingKey(items, openItemKey));

  const handleToast = ({ tone, message }) => pushToast(message, tone === 'error' ? 'error' : tone === 'info' ? 'info' : 'success');

  const handleItemChanged = () => {
    // Decisions change counts and possibly remove the item from the current view.
    loadSummary();
    loadQueue();
  };

  const technicianRow = technicianId ? items.find((it) => it.technician?.user_id === technicianId)?.technician : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="trust_safety" emailVariant="crm" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-14 space-y-5">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex h-10 w-10 rounded-xl bg-slate-900 text-white items-center justify-center shrink-0">
              <FaShieldAlt className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Trust &amp; Safety</h1>
              <p className="text-sm text-slate-600 mt-0.5">Review technician credentials, background checks, references, and verification activity.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            {lastRefreshed && <span>Updated {formatRelative(lastRefreshed)}</span>}
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-1.5 h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FaSyncAlt className={`h-3 w-3 ${summaryLoading || queueLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        {summaryError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between" role="alert">
            <span>{summaryError}</span>
            <button type="button" onClick={loadSummary} className="text-xs font-semibold underline">Retry</button>
          </div>
        ) : (
          <TrustSafetyMetrics
            summary={summary}
            loading={summaryLoading}
            activeKey={activeMetric}
            onSelect={(_key, metricFilter) => {
              setCheckedKeys(new Set());
              setWorkspace(applyMetricFilter(workspace, metricFilter));
            }}
          />
        )}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-3 sm:px-4 pt-3 border-b border-slate-200">
            <TrustSafetyTabs activeTab={tab} counts={tabCounts} onChange={changeTab} />
          </div>

          {isQueueTab(tab) && (
            <>
              <div className="px-3 sm:px-4 py-3 border-b border-slate-100 space-y-2">
                {technicianRow || technicianId ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-tf-blue/20 bg-tf-blue/5 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-tf-blue shrink-0">Technician</span>
                      {technicianRow ? <TechnicianCell technician={technicianRow} compact showIds /> : <span className="text-xs text-slate-600">User #{technicianId}</span>}
                    </div>
                    <button type="button" onClick={() => setWorkspace({ technician: null })} className="text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0">
                      Clear technician filter
                    </button>
                  </div>
                ) : null}
                <QueueFilters filters={filters} lockReviewType={tab !== 'queue'} onChange={changeFilters} onReset={resetFilters} />
              </div>
              <ReviewQueueTable
                items={items}
                pagination={queue?.pagination}
                loading={queueLoading}
                error={queueError}
                selectedKey={selectedKey}
                checkedKeys={checkedKeys}
                onToggleChecked={(key, checked) =>
                  setCheckedKeys((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(key);
                    else next.delete(key);
                    return next;
                  })
                }
                onToggleAll={(keys, checked) => setCheckedKeys(checked ? new Set(keys) : new Set())}
                onOpen={openItem}
                onPageChange={(page) => changeFilters({ page })}
                onPerPageChange={(per_page) => changeFilters({ per_page, page: 1 })}
                onRetry={loadQueue}
                emptyTitle={filters.status === 'needs_review' ? 'Queue is clear' : 'No items match'}
                emptyDescription={
                  filters.status === 'needs_review'
                    ? 'Nothing is waiting for a reviewer decision with these filters.'
                    : 'Try a different status, review type, or search term.'
                }
              />
              {queue?.truncated && (
                <p className="px-4 py-2 text-[11px] text-amber-800 bg-amber-50 border-t border-amber-100">
                  Showing the most relevant results; narrow the filters to see everything in this view.
                </p>
              )}
              <div className="hidden md:flex items-center gap-3 px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
                <span>
                  <Kbd>J</Kbd>/<Kbd>K</Kbd> move
                </span>
                <span>
                  <Kbd>Enter</Kbd> open
                </span>
                <span>
                  <Kbd>N</Kbd> next pending
                </span>
                <span>
                  <Kbd>/</Kbd> search
                </span>
              </div>
            </>
          )}

          {tab === 'technicians' && (
            <>
              <div className="px-3 sm:px-4 py-3 border-b border-slate-100">
                <TechnicianFilters
                  filters={{ ...directoryFilters, verification }}
                  onChange={(patch) => {
                    if (Object.prototype.hasOwnProperty.call(patch, 'verification')) {
                      setWorkspace({ verification: patch.verification });
                    }
                    const { verification: _v, ...rest } = patch;
                    if (Object.keys(rest).length) setDirectoryFilters((f) => ({ ...f, ...rest }));
                  }}
                />
              </div>
              <TechniciansTable
                rows={directory?.technicians}
                pagination={directory?.pagination}
                loading={directoryLoading}
                error={directoryError}
                onOpenTechnician={openTechnician}
                onOpenItem={openItem}
                onPageChange={(page) => setDirectoryFilters((f) => ({ ...f, page }))}
                onPerPageChange={(per_page) => setDirectoryFilters((f) => ({ ...f, per_page, page: 1 }))}
                onRetry={loadDirectory}
              />
            </>
          )}

          {tab === 'activity' && <ActivityFeed refreshToken={refreshToken} onOpenItem={openItem} />}
        </section>

        {isQueueTab(tab) && technicianId && (
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Account trust profile</h2>
            <TrustProfileChecklist userId={technicianId} />
          </section>
        )}

        {checkedItems.length > 0 && <BulkActionBar items={checkedItems} onClear={() => setCheckedKeys(new Set())} onDone={handleItemChanged} onToast={handleToast} />}
      </div>

      {openItemKey && (
        <ReviewDrawer
          key={openItemKey}
          itemKey={openItemKey}
          onClose={closeItem}
          onPrev={openIndex > 0 ? () => openItem(items[openIndex - 1].key) : null}
          onNext={openIndex > -1 && openIndex < items.length - 1 ? () => openItem(items[openIndex + 1].key) : null}
          onNextPending={() => {
            const next = nextPendingKey(items, openItemKey);
            if (next) openItem(next);
          }}
          hasNextPending={hasNextPending}
          onItemChanged={handleItemChanged}
          onToast={handleToast}
        />
      )}

      <MessagesToast toasts={toasts} onDismiss={dismissToast} />
      <AppFooter />
    </div>
  );
}
