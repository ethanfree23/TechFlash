import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { jobsAPI, ratingsAPI, savedJobSearchesAPI } from '../../api/api';
import { auth } from '../../auth';
import { VIEW_MODES, getSavedJobsStorageKey } from '../../utils/jobDashboardConfig';
import { exportJobsToCsv } from '../../utils/jobsExport';
import useJobsDashboard, { getPageNumbers } from './useJobsDashboard';
import useJobMessaging from './useJobMessaging';
import JobsCommandHeader from './JobsCommandHeader';
import JobsFilterBar from './JobsFilterBar';
import JobsViewToggle from './JobsViewToggle';
import JobCard from './JobCard';
import JobsTableView from './JobsTableView';
import JobsCalendarPlaceholder from './JobsCalendarPlaceholder';
import JobLoadingSkeleton from './JobLoadingSkeleton';
import JobEmptyState from './JobEmptyState';
import FeaturedJobCallout from '../demo/FeaturedJobCallout';
import AlertModal from '../AlertModal';
import ReferralModal from '../ReferralModal';
import MessageModal from '../MessageModal';

export default function JobsDashboard() {
  const dashboard = useJobsDashboard();
  const {
    role,
    config,
    analytics,
    allJobsSnapshot,
    loading,
    error,
    locations,
    technicianProfile,
    serverFilters,
    clientFilters,
    setClientFilters,
    searchInput,
    setSearchInput,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    currentPage,
    setCurrentPage,
    currentJobs,
    sortedJobs,
    totalPages,
    indexOfFirstJob,
    indexOfLastJob,
    tradeOptions,
    emptyVariant,
    handleServerFilterChange,
    handleStatusChange,
    handleSearch,
    clearFilters,
    saveCurrentView,
    setKpiFilter,
    refetch,
  } = dashboard;

  const userId = auth.getUser()?.id ?? 'anon';
  const [claimingJobId, setClaimingJobId] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [saveSearchBusy, setSaveSearchBusy] = useState(false);
  const [savedSearches, setSavedSearches] = useState([]);
  const [savedJobIds, setSavedJobIds] = useState([]);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [reviewedJobIds, setReviewedJobIds] = useState(new Set());

  const showAlert = useCallback((title, message, variant = 'error') => {
    setAlertModal({ isOpen: true, title, message, variant });
  }, []);

  const { messageConversationId, showMessageModal, messagingBusy, openConversation, closeMessageModal } =
    useJobMessaging({ onError: (msg) => showAlert('Unable to start conversation', msg) });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getSavedJobsStorageKey(userId));
      if (raw) setSavedJobIds(JSON.parse(raw));
    } catch {
      setSavedJobIds([]);
    }
  }, [userId]);

  useEffect(() => {
    if (!auth.isTechnician()) return;
    savedJobSearchesAPI
      .list()
      .then((data) => setSavedSearches(Array.isArray(data) ? data : []))
      .catch(() => setSavedSearches([]));
  }, []);

  useEffect(() => {
    if (!auth.isTechnician()) return;
    setLoadingCompleted(true);
    jobsAPI
      .getTechnicianDashboard()
      .then((res) => {
        const completed = (res.completed || []).slice();
        completed.sort(
          (a, b) =>
            new Date(b.finished_at || b.updated_at || b.created_at || 0) -
            new Date(a.finished_at || a.updated_at || a.created_at || 0)
        );
        setCompletedJobs(completed);
      })
      .catch(() => setCompletedJobs([]))
      .finally(() => setLoadingCompleted(false));
  }, []);

  useEffect(() => {
    if (!auth.isTechnician()) return;
    ratingsAPI
      .getReviewedJobIds()
      .then((res) => setReviewedJobIds(new Set(res.job_ids || [])))
      .catch(() => setReviewedJobIds(new Set()));
  }, []);

  const handleClaimJob = async (jobId) => {
    try {
      setClaimingJobId(jobId);
      await jobsAPI.claim(jobId);
      await refetch();
    } catch (err) {
      showAlert('Unable to claim job', err.message || 'Failed to claim job');
    } finally {
      setClaimingJobId(null);
    }
  };

  const handleMessageTech = (jobId, techId) => openConversation(jobId, techId);
  const handleMessageCompany = (jobId) => openConversation(jobId, null);

  const handleSaveJob = (jobId) => {
    setSavedJobIds((prev) => {
      const next = prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId];
      try {
        localStorage.setItem(getSavedJobsStorageKey(userId), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const saveCurrentSearch = async () => {
    if (!auth.isTechnician()) return;
    setSaveSearchBusy(true);
    try {
      await savedJobSearchesAPI.create({
        keyword: serverFilters.keyword || null,
        location: serverFilters.location || null,
        skill_class: clientFilters.trade || null,
        max_distance_miles: clientFilters.maxDistanceMiles ? Number(clientFilters.maxDistanceMiles) : null,
        min_hourly_rate_cents: clientFilters.minPayCents || null,
        max_required_years_experience:
          clientFilters.maxExperience !== '' ? Number(clientFilters.maxExperience) : null,
        required_certifications: clientFilters.licenseClass || null,
      });
      const data = await savedJobSearchesAPI.list();
      setSavedSearches(Array.isArray(data) ? data : []);
      showAlert('Search saved', 'We will highlight jobs that match these filters when you browse.', 'success');
    } catch (err) {
      showAlert('Could not save', err.message || 'Try again.');
    } finally {
      setSaveSearchBusy(false);
    }
  };

  const handleSaveView = () => {
    const ok = saveCurrentView();
    showAlert(
      ok ? 'View saved' : 'Could not save view',
      ok ? 'Your filters and view mode will be restored next time you visit.' : 'Storage may be unavailable.',
      ok ? 'success' : 'error'
    );
  };

  const handleExport = () => {
    exportJobsToCsv(sortedJobs);
    showAlert(
      'Export started',
      'Downloaded CSV of currently filtered jobs. Full historical server export requires backend integration.',
      'success'
    );
  };

  const handleViewModeChange = (mode) => {
    if (mode === VIEW_MODES.CALENDAR) {
      setViewMode(VIEW_MODES.CALENDAR);
      return;
    }
    setViewMode(mode);
  };

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <JobsCommandHeader
        config={config}
        role={role}
        analytics={analytics}
        allJobsSnapshot={allJobsSnapshot}
        onExport={handleExport}
        onKpiClick={setKpiFilter}
        onReferral={() => setShowReferralModal(true)}
        onSaveSearch={saveCurrentSearch}
        saveSearchBusy={saveSearchBusy}
        savedSearchCount={savedSearches.length}
      />

      <JobsFilterBar
        config={config}
        role={role}
        serverFilters={serverFilters}
        clientFilters={clientFilters}
        setClientFilters={setClientFilters}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        sortBy={sortBy}
        setSortBy={setSortBy}
        locations={locations}
        tradeOptions={tradeOptions}
        onServerFilterChange={handleServerFilterChange}
        onStatusChange={handleStatusChange}
        onSearch={handleSearch}
        onClear={clearFilters}
        onSaveView={handleSaveView}
        showSaveView={config.showSaveView}
      />

      {(config.viewModes.length > 1 || !loading) && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2">
          {config.viewModes.length > 1 ? (
            <JobsViewToggle viewMode={viewMode} onChange={handleViewModeChange} allowedModes={config.viewModes} />
          ) : (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job listings</p>
          )}
          {!loading && (
            <p className="text-xs text-slate-500 tabular-nums">
              {sortedJobs.length === 0
                ? 'No results'
                : `${sortedJobs.length} job${sortedJobs.length !== 1 ? 's' : ''}`}
              {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
            </p>
          )}
        </div>
      )}

      {loading && <JobLoadingSkeleton viewMode={viewMode} />}

      {!loading && !error && !emptyVariant && viewMode === VIEW_MODES.CARD && (
        <FeaturedJobCallout />
      )}

      {!loading && error && (
        <JobEmptyState variant="error" onRetry={refetch} />
      )}

      {!loading && !error && emptyVariant && (
        <JobEmptyState variant={emptyVariant} config={config} role={role} onClearFilters={clearFilters} />
      )}

      {!loading && !error && !emptyVariant && viewMode === VIEW_MODES.CALENDAR && <JobsCalendarPlaceholder />}

      {!loading && !error && !emptyVariant && viewMode === VIEW_MODES.TABLE && (
        <JobsTableView
          jobs={currentJobs.filter((j) => j && j.title)}
          role={role}
          claimingJobId={claimingJobId}
          onClaim={handleClaimJob}
          onMessageTech={handleMessageTech}
          onMessageCompany={handleMessageCompany}
          onRefresh={refetch}
          messagingBusy={messagingBusy}
        />
      )}

      {!loading && !error && !emptyVariant && viewMode === VIEW_MODES.CARD && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch" data-demo="jobs-list">
          {currentJobs.filter((j) => j && j.title).map((job) => (
            <JobCard
              key={job.id}
              job={job}
              role={role}
              technicianProfile={technicianProfile}
              savedSearches={savedSearches}
              savedJobIds={savedJobIds}
              claimingJobId={claimingJobId}
              onClaim={handleClaimJob}
              onMessageTech={handleMessageTech}
              onMessageCompany={handleMessageCompany}
              onSaveJob={role === 'technician' ? handleSaveJob : undefined}
              onRefresh={refetch}
              messagingBusy={messagingBusy}
            />
          ))}
        </div>
      )}

      {!loading && !error && !emptyVariant && totalPages > 1 && (
        <>
          <nav className="mt-8 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            {pageNumbers.map((number, index) => (
              <button
                key={index}
                type="button"
                onClick={() => typeof number === 'number' && setCurrentPage(number)}
                disabled={number === '...'}
                className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                  number === currentPage
                    ? 'bg-blue-600 text-white border-blue-600'
                    : number === '...'
                      ? 'border-transparent text-slate-400 cursor-default'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {number}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </nav>
          <p className="mt-3 text-center text-xs text-slate-500">
            Showing {indexOfFirstJob + 1}–{Math.min(indexOfLastJob, sortedJobs.length)} of {sortedJobs.length}
          </p>
        </>
      )}

      {config.showCompletedSection && serverFilters.status !== 'completed' && (
        <div className="mt-10 pt-6 border-t border-slate-200">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">My Completed Jobs</h2>
            <p className="text-sm text-slate-500 mt-0.5">Leave a review for companies you&apos;ve worked with.</p>
          </div>
          {loadingCompleted ? (
            <JobLoadingSkeleton viewMode="card" />
          ) : completedJobs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-600">
              No completed jobs yet. Complete a job and the company will mark it as finished.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              {completedJobs.map((job) => (
                <article
                  key={job.id}
                  className="flex h-full min-h-[14rem] flex-col rounded-xl border border-l-[3px] border-l-emerald-400 border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="font-semibold text-slate-900">{job.title}</h3>
                    <span className="text-[11px] font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5">
                      Complete
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 mb-3">{job.description || '—'}</p>
                  <div className="text-xs text-slate-500 mb-4">
                    <Link to={`/companies/${job.company_profile_id}`} className="text-blue-600 hover:underline">
                      {job.company_profile?.company_name || 'Company'}
                    </Link>
                    {job.location && ` · ${job.location}`}
                  </div>
                  <div className="mt-auto flex flex-col gap-2">
                    <Link
                      to={`/companies/${job.company_profile_id}`}
                      className="text-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      View Company Profile
                    </Link>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="text-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {reviewedJobIds.has(job.id) ? 'View Past Job' : 'View & Leave Review'}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
      <ReferralModal isOpen={showReferralModal} onClose={() => setShowReferralModal(false)} triggerLabel="Send Referral" />
      <MessageModal
        isOpen={showMessageModal}
        onClose={closeMessageModal}
        conversationId={messageConversationId}
      />
    </div>
  );
}
