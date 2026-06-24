import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { jobsAPI, profilesAPI } from '../../api/api';
import { auth } from '../../auth';
import {
  getDashboardConfig,
  getRoleKey,
  getSavedViewStorageKey,
  getViewModeStorageKey,
  VIEW_MODES,
} from '../../utils/jobDashboardConfig';
import {
  applyClientFilters,
  DEFAULT_CLIENT_FILTERS,
  hasActiveClientFilters,
} from '../../utils/jobFilterEngine';
import { haversineMiles } from '../../utils/jobDisplayUtils';
import { getDemoFlagshipJobId, isDemoMode } from '../../utils/demoMode';
import { normalizeJobsListResponse } from '../../utils/jobsApiResponse';

const JOBS_PER_PAGE = 9;

export const pinFlagshipJobFirst = (jobList, flagshipId) => {
  if (!flagshipId || !Array.isArray(jobList) || jobList.length < 2) return jobList;
  const sorted = [...jobList];
  const idx = sorted.findIndex((j) => j.id === flagshipId);
  if (idx <= 0) return sorted;
  const [job] = sorted.splice(idx, 1);
  sorted.unshift(job);
  return sorted;
};

export const sortJobs = (jobList, sortBy, technicianProfile) => {
  const sorted = [...jobList];
  const jobAmount = (j) => j.job_amount_cents ?? j.price_cents ?? 0;
  const totalHours = (j) => (j.hours_per_day ?? 8) * (j.days ?? 0) || 0;
  const startAt = (j) => (j.scheduled_start_at ? new Date(j.scheduled_start_at).getTime() : Infinity);
  const createdAt = (j) => new Date(j.created_at || 0).getTime();
  const finishedAt = (j) => new Date(j.finished_at || j.updated_at || j.created_at || 0).getTime();

  switch (sortBy) {
    case 'most_recent':
      return sorted.sort((a, b) => Math.max(finishedAt(b), createdAt(b)) - Math.max(finishedAt(a), createdAt(a)));
    case 'soonest_to_start':
      return sorted.sort((a, b) => startAt(a) - startAt(b));
    case 'highest_pay':
      return sorted.sort((a, b) => jobAmount(b) - jobAmount(a));
    case 'longest_job':
      return sorted.sort((a, b) => totalHours(b) - totalHours(a));
    case 'shortest_job':
      return sorted.sort((a, b) => totalHours(a) - totalHours(b));
    case 'distance': {
      if (technicianProfile?.latitude != null && technicianProfile?.longitude != null) {
        const dist = (j) =>
          haversineMiles(
            technicianProfile.latitude,
            technicianProfile.longitude,
            j.latitude,
            j.longitude
          );
        return sorted.sort((a, b) => dist(a) - dist(b));
      }
      if (!technicianProfile?.location) return sorted;
      const techLoc = (technicianProfile.location || '').toLowerCase();
      const techCity = techLoc.split(',')[0]?.trim() || techLoc;
      return sorted.sort((a, b) => {
        const aLoc = (a.location || '').toLowerCase();
        const bLoc = (b.location || '').toLowerCase();
        const aMatch = aLoc.includes(techCity) || aLoc.includes(techLoc) ? 0 : 1;
        const bMatch = bLoc.includes(techCity) || bLoc.includes(techLoc) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return aLoc.localeCompare(bLoc);
      });
    }
    default:
      return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
};

export const getPageNumbers = (currentPage, totalPages) => {
  const pageNumbers = [];
  const maxVisiblePages = 5;
  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else if (currentPage <= 3) {
    for (let i = 1; i <= 4; i++) pageNumbers.push(i);
    pageNumbers.push('...');
    pageNumbers.push(totalPages);
  } else if (currentPage >= totalPages - 2) {
    pageNumbers.push(1);
    pageNumbers.push('...');
    for (let i = totalPages - 3; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    pageNumbers.push('...');
    for (let i = currentPage - 1; i <= currentPage + 1; i++) pageNumbers.push(i);
    pageNumbers.push('...');
    pageNumbers.push(totalPages);
  }
  return pageNumbers;
};

export default function useJobsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const role = getRoleKey();
  const config = getDashboardConfig();
  const user = auth.getUser();
  const userId = user?.id ?? 'anon';

  const statusFromUrl = searchParams.get('status') || '';

  const [jobs, setJobs] = useState([]);
  const [jobsMeta, setJobsMeta] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [technicianProfile, setTechnicianProfile] = useState(null);

  const [serverFilters, setServerFilters] = useState({
    location: '',
    status: statusFromUrl,
    keyword: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [clientFilters, setClientFilters] = useState({ ...DEFAULT_CLIENT_FILTERS });
  const [sortBy, setSortBy] = useState('most_recent');
  const [viewMode, setViewMode] = useState(() => {
    try {
      const stored = localStorage.getItem(getViewModeStorageKey(userId));
      if (stored && Object.values(VIEW_MODES).includes(stored)) return stored;
    } catch {
      /* ignore */
    }
    return VIEW_MODES.CARD;
  });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const status = searchParams.get('status') || '';
    setServerFilters((prev) => ({ ...prev, status }));
    setCurrentPage(1);
  }, [searchParams]);

  useEffect(() => {
    try {
      localStorage.setItem(getViewModeStorageKey(userId), viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode, userId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getSavedViewStorageKey(userId, role));
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.serverFilters) setServerFilters((prev) => ({ ...prev, ...saved.serverFilters }));
      if (saved.clientFilters) setClientFilters((prev) => ({ ...prev, ...saved.clientFilters }));
      if (saved.sortBy) setSortBy(saved.sortBy);
      if (saved.searchInput) setSearchInput(saved.searchInput);
      if (saved.viewMode && config.viewModes.includes(saved.viewMode)) setViewMode(saved.viewMode);
    } catch {
      /* ignore bad saved view */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  const fetchTechnicianProfile = useCallback(async () => {
    if (!auth.isTechnician()) return;
    try {
      const profile = await profilesAPI.getTechnicianProfile();
      setTechnicianProfile(profile);
    } catch {
      setTechnicianProfile(null);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      setJobsLoading(true);
      const apiFilters = {
        location: serverFilters.location || undefined,
        keyword: serverFilters.keyword || undefined,
        page: currentPage,
        per_page: JOBS_PER_PAGE,
      };
      if (serverFilters.status) apiFilters.status = serverFilters.status;
      const data = await jobsAPI.getAll(apiFilters);
      const { jobs: list, meta } = normalizeJobsListResponse(data);
      setJobs(list);
      setJobsMeta(meta);
      setError(null);
    } catch (err) {
      setError('Failed to load jobs');
      console.error('Error fetching jobs:', err);
    } finally {
      setJobsLoading(false);
    }
  }, [serverFilters, currentPage]);

  const fetchAnalytics = useCallback(async () => {
    if (role === 'technician') {
      setAnalyticsLoading(false);
      return;
    }
    setAnalyticsLoading(true);
    try {
      const analyticsRes = await jobsAPI.getAnalytics().catch(() => null);
      setAnalytics(analyticsRes);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    fetchAnalytics();
    fetchTechnicianProfile();
  }, [fetchAnalytics, fetchTechnicianProfile]);

  useEffect(() => {
    jobsAPI
      .getLocations()
      .then((res) => setLocations(res.locations || []))
      .catch(() => setLocations([]));
  }, []);

  const tradeOptions = useMemo(() => {
    const fromJobs = [...new Set(jobs.map((j) => j.skill_class).filter(Boolean))];
    return fromJobs.sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const clientFilteredJobs = useMemo(
    () => applyClientFilters(jobs, clientFilters, { technicianProfile }),
    [jobs, clientFilters, technicianProfile]
  );

  const sortedJobs = useMemo(() => {
    const sorted = sortJobs(clientFilteredJobs, sortBy, technicianProfile);
    if (isDemoMode()) {
      return pinFlagshipJobFirst(sorted, getDemoFlagshipJobId());
    }
    return sorted;
  }, [clientFilteredJobs, sortBy, technicianProfile]);

  const serverTotalPages = jobsMeta?.total_pages ?? 1;
  const serverTotal = jobsMeta?.total ?? sortedJobs.length;
  const useServerPagination = Boolean(jobsMeta);

  const currentJobs = useServerPagination ? sortedJobs : sortedJobs.slice(
    (currentPage - 1) * JOBS_PER_PAGE,
    currentPage * JOBS_PER_PAGE
  );
  const totalPages = useServerPagination ? serverTotalPages : Math.ceil(sortedJobs.length / JOBS_PER_PAGE) || 1;
  const indexOfFirstJob = useServerPagination
    ? (currentPage - 1) * JOBS_PER_PAGE + 1
    : (currentPage - 1) * JOBS_PER_PAGE + 1;
  const indexOfLastJob = useServerPagination
    ? Math.min(currentPage * JOBS_PER_PAGE, serverTotal)
    : Math.min(currentPage * JOBS_PER_PAGE, sortedJobs.length);

  const hasServerFilters = Boolean(
    serverFilters.keyword || serverFilters.location || serverFilters.status
  );
  const hasClientFiltersActive = hasActiveClientFilters(clientFilters);
  const hasAnyFilters = hasServerFilters || hasClientFiltersActive;

  const emptyVariant = useMemo(() => {
    if (!jobsLoading && jobs.length === 0 && !hasAnyFilters) return 'no_jobs';
    if (!jobsLoading && sortedJobs.length === 0 && hasAnyFilters) return 'no_match';
    if (!jobsLoading && sortedJobs.length === 0 && jobs.length > 0) return 'no_match';
    return null;
  }, [jobs.length, sortedJobs.length, hasAnyFilters, jobsLoading]);

  const handleServerFilterChange = (name, value) => {
    setServerFilters((prev) => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const handleStatusChange = (status) => {
    setServerFilters((prev) => ({ ...prev, status }));
    setCurrentPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (status) next.set('status', status);
      else next.delete('status');
      return next;
    });
  };

  const handleSearch = () => {
    setServerFilters((prev) => ({ ...prev, keyword: searchInput }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setServerFilters({ location: '', status: '', keyword: '' });
    setSearchInput('');
    setClientFilters({ ...DEFAULT_CLIENT_FILTERS });
    setSearchParams({});
    setCurrentPage(1);
  };

  const saveCurrentView = () => {
    try {
      localStorage.setItem(
        getSavedViewStorageKey(userId, role),
        JSON.stringify({
          serverFilters,
          clientFilters,
          sortBy,
          searchInput,
          viewMode,
        })
      );
      return true;
    } catch {
      return false;
    }
  };

  const setKpiFilter = (filterStatus) => {
    if (filterStatus !== undefined) handleStatusChange(filterStatus);
  };

  const refetch = () => {
    fetchJobs();
    fetchAnalytics();
  };

  return {
    role,
    config,
    jobs,
    analytics,
    analyticsLoading,
    loading: jobsLoading,
    jobsLoading,
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
    hasAnyFilters,
    handleServerFilterChange,
    handleStatusChange,
    handleSearch,
    clearFilters,
    saveCurrentView,
    setKpiFilter,
    refetch,
    jobsPerPage: JOBS_PER_PAGE,
  };
}
