import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { jobsAPI, ratingsAPI, feedbackAPI, profilesAPI, techPresenceAPI, conversationsAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import AppHeader from '../components/AppHeader';
import {
  filterJobsWithinRadius,
  formatDistanceMi,
  haversineMiles,
  needsTechnicianMapSetup,
} from '../utils/technicianMap';
import { FaBriefcase, FaCheckSquare, FaWrench, FaFolderOpen, FaBuilding } from 'react-icons/fa';
import { AdminPlatformCharts, CompanyAnalyticsCharts, TechnicianAnalyticsCharts } from '../components/dashboard/RoleDashboardCharts';
import AdminCommandCenter from '../components/admin/command-center/AdminCommandCenter';
import { fetchAdminCommandCenterInsights } from '../services/fetchAdminCommandCenterData';
import DemoWalkthrough from '../components/demo/DemoWalkthrough';
import StartDemoButton from '../components/demo/StartDemoButton';
import { isDemoMode } from '../utils/demoMode';
import { normalizeJobsListResponse } from '../utils/jobsApiResponse';
import JobStatusBadge from '../components/jobs/JobStatusBadge';
const statusLabel = (job) => {
  if (!job) return <span className="capitalize text-gray-600">—</span>;
  return <JobStatusBadge job={job} />;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString();
};

const formatCurrency = (cents) => {
  if (cents == null || cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};


const GOOGLE_MAPS_API_KEY = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';
let googleMapsScriptPromise = null;
let googleMapsLoaded = false;
let googleMapsPreconnectInjected = false;

const ensureGoogleMapsPreconnect = () => {
  if (typeof document === 'undefined' || googleMapsPreconnectInjected) return;
  const addPreconnect = (href, crossOrigin = false) => {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    if (crossOrigin) link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  };
  addPreconnect('https://maps.googleapis.com');
  addPreconnect('https://maps.gstatic.com', true);
  googleMapsPreconnectInjected = true;
};

const loadGoogleMapsScript = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if (window.google?.maps) {
    googleMapsLoaded = true;
    return Promise.resolve(window.google.maps);
  }
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('Google Maps API key missing'));
  ensureGoogleMapsPreconnect();
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-techflash-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.techflashGoogleMaps = '1';
    script.fetchPriority = 'high';
    script.onload = () => {
      googleMapsLoaded = true;
      resolve(window.google.maps);
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
};


const Dashboard = ({ user, onLogout }) => {
  const [searchParams] = useSearchParams();
  const showWelcomeBanner = searchParams.get('welcome') === '1';
  const [jobsLoading, setJobsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [openJobsLoading, setOpenJobsLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [openJobs, setOpenJobs] = useState([]);
  const [technicianProfile, setTechnicianProfile] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [feedbackList, setFeedbackList] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });
  const navigate = useNavigate();

  const fetchPrimaryDashboard = useCallback(async () => {
    setJobsLoading(true);
    setError(null);
    try {
      if (user?.role === 'company') {
        const jobsRes = await jobsAPI.getDashboard();
        setJobs(jobsRes);
      } else if (user?.role === 'technician') {
        const jobsRes = await jobsAPI.getTechnicianDashboard();
        setJobs(jobsRes);
      } else if (user?.role === 'admin') {
        setJobs(null);
      } else {
        setJobs(null);
      }
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setJobsLoading(false);
    }
  }, [user?.role]);

  const fetchAnalytics = useCallback(async () => {
    if (!user?.role || user.role === 'job_seeker') return;
    setAnalyticsLoading(true);
    try {
      const analyticsRes = await jobsAPI.getAnalytics().catch(() => null);
      setAnalytics(analyticsRes);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [user?.role]);

  const fetchTechnicianExtras = useCallback(async () => {
    if (user?.role !== 'technician') return;
    setProfileLoading(true);
    setOpenJobsLoading(true);
    try {
      const [openJobsRes, technicianProfileRes] = await Promise.all([
        jobsAPI.getAll({ status: 'open', page: 1, per_page: 40 }).catch(() => ({ jobs: [] })),
        profilesAPI.getTechnicianProfile().catch(() => null),
      ]);
      const { jobs: openList } = normalizeJobsListResponse(openJobsRes);
      const now = Date.now();
      const liveOpenJobs = openList.filter((job) => {
        const endAt = job?.scheduled_end_at ? new Date(job.scheduled_end_at).getTime() : null;
        return endAt == null || endAt >= now;
      });
      setOpenJobs(liveOpenJobs);
      setTechnicianProfile(technicianProfileRes);
    } finally {
      setProfileLoading(false);
      setOpenJobsLoading(false);
    }
  }, [user?.role]);

  const fetchAdminFeedback = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      const feedbackRes = await feedbackAPI.list().catch(() => null);
      setFeedbackList(feedbackRes?.feedback_submissions ?? []);
    } catch {
      setFeedbackList([]);
    }
  }, [user?.role]);

  const fetchDashboard = useCallback(async () => {
    await fetchPrimaryDashboard();
    fetchAnalytics();
    fetchTechnicianExtras();
    fetchAdminFeedback();
  }, [fetchPrimaryDashboard, fetchAnalytics, fetchTechnicianExtras, fetchAdminFeedback]);

  useEffect(() => {
    setOpenJobs([]);
    setTechnicianProfile(null);
    setAnalytics(null);
    setFeedbackList(null);
    fetchPrimaryDashboard();
    fetchAnalytics();
    fetchTechnicianExtras();
    fetchAdminFeedback();
  }, [fetchPrimaryDashboard, fetchAnalytics, fetchTechnicianExtras, fetchAdminFeedback]);

  useEffect(() => {
    if (user?.role !== 'technician') return undefined;
    loadGoogleMapsScript().catch(() => {});
    return undefined;
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'technician') return undefined;
    const refreshOpenJobsOnly = async () => {
      try {
        const openJobsRes = await jobsAPI.getAll({ status: 'open', page: 1, per_page: 40 }).catch(() => ({ jobs: [] }));
        const { jobs: openList } = normalizeJobsListResponse(openJobsRes);
        const now = Date.now();
        const liveOpenJobs = openList.filter((job) => {
          const endAt = job?.scheduled_end_at ? new Date(job.scheduled_end_at).getTime() : null;
          return endAt == null || endAt >= now;
        });
        setOpenJobs(liveOpenJobs);
      } catch {
        /* ignore background refresh errors */
      }
    };
    const intervalId = window.setInterval(refreshOpenJobsOnly, 30000);
    return () => window.clearInterval(intervalId);
  }, [user?.role]);

  const handleFinish = async (jobId) => {
    try {
      await jobsAPI.finish(jobId);
      fetchDashboard();
      window.open(`/jobs/${jobId}`, '_blank', 'noopener,noreferrer');
    } catch {
      setAlertModal({ isOpen: true, title: 'Unable to complete', message: 'Failed to mark job as finished', variant: 'error' });
    }
  };

  if (error && jobsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} onLogout={onLogout} activePage="dashboard" profileAvatar />
        <div className="p-8 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="dashboard" profileAvatar />
      <main className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {user?.role === 'company' && (
            <CompanyDashboardContent
              jobs={jobs}
              jobsLoading={jobsLoading}
              analytics={analytics}
              analyticsLoading={analyticsLoading}
              onFinish={handleFinish}
              onRefresh={fetchDashboard}
              navigate={navigate}
              user={user}
              showWelcome={showWelcomeBanner}
            />
          )}
          {user?.role === 'technician' && (
            <TechnicianDashboardContent
              jobs={jobs}
              jobsLoading={jobsLoading}
              openJobs={openJobs}
              openJobsLoading={openJobsLoading}
              technicianProfile={technicianProfile}
              profileLoading={profileLoading}
              analytics={analytics}
              analyticsLoading={analyticsLoading}
              navigate={navigate}
              user={user}
            />
          )}
          {user?.role === 'admin' && (
            <AdminDashboardContent
              analytics={analytics}
              feedbackList={feedbackList}
              onDashboardReload={fetchDashboard}
            />
          )}
          {user?.role !== 'company' && user?.role !== 'technician' && user?.role !== 'admin' && !jobsLoading && (
            <p className="text-gray-500">Dashboard not available for your role.</p>
          )}
        </div>
      </main>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
};

const AdminDashboardContent = ({ analytics, feedbackList, onDashboardReload }) => {
  const [tourRun, setTourRun] = useState(false);
  const [filters, setFilters] = useState({
    period: isDemoMode() ? 'all' : '30d',
    market: 'all',
    trade: 'all',
    search: '',
  });
  const [insightsByCategory, setInsightsByCategory] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState(null);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const [ins, conv] = await Promise.all([
        fetchAdminCommandCenterInsights(filters.period),
        conversationsAPI.getAll().catch(() => []),
      ]);
      setInsightsByCategory(ins);
      setConversations(Array.isArray(conv) ? conv : []);
      setLastUpdatedMs(Date.now());
    } catch (err) {
      setInsightsError(err.message || 'Failed to load command center data');
    } finally {
      setInsightsLoading(false);
      setRefreshing(false);
    }
  }, [filters.period]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadInsights();
  }, [loadInsights]);

  const combinedError = insightsError;
  const showBlockingError = combinedError && !analytics;
  const loading = insightsLoading && insightsByCategory === null;

  const handleMarketFilter = useCallback((market) => {
    setFilters((prev) => ({ ...prev, market }));
  }, []);

  return (
    <div className="bg-[#F7F8FA] -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-6 min-h-[60vh]">
      {isDemoMode() && (
        <>
          <DemoWalkthrough
            run={tourRun}
            onFinish={() => setTourRun(false)}
            onMarketFilter={handleMarketFilter}
          />
          {!tourRun && <StartDemoButton floating onClick={() => setTourRun(true)} />}
        </>
      )}
      <AdminCommandCenter
        analytics={analytics}
        insightsByCategory={insightsByCategory}
        feedbackList={feedbackList ?? []}
        conversations={conversations}
        filters={filters}
        onFiltersChange={setFilters}
        loading={loading && !showBlockingError}
        error={showBlockingError ? combinedError : null}
        onRetry={() => {
          setInsightsError(null);
          loadInsights();
          onDashboardReload?.();
        }}
        lastUpdatedMs={lastUpdatedMs}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        dataError={combinedError && analytics ? combinedError : null}
        onStartTour={() => setTourRun(true)}
      />
    </div>
  );
};

const sortByMostRecent = (list) => {
  return [...(list || [])].sort((a, b) => {
    const ta = new Date(a.finished_at || a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.finished_at || b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  });
};

const TechnicianNearbyJobPreviewModal = ({
  jobId,
  job,
  loading,
  error,
  distanceMiles,
  onClose,
  navigate,
}) => {
  if (jobId == null) return null;

  const companyName = job?.company_profile?.company_name;
  const rateLabel =
    job?.hourly_rate_cents != null ? `${formatCurrency(job.hourly_rate_cents)}/hr` : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nearby-job-preview-title"
        className="relative w-full max-w-lg max-h-[min(85vh,32rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 id="nearby-job-preview-title" className="text-lg font-semibold text-gray-900 line-clamp-2">
              {loading ? 'Loading…' : job?.title || `Job #${jobId}`}
            </h2>
            {!loading && job && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {statusLabel(job)}
                {Number.isFinite(distanceMiles) ? (
                  <span className="text-xs text-gray-500">{formatDistanceMi(distanceMiles)} away</span>
                ) : null}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-700">
          {loading && <p className="text-gray-500">Fetching job details…</p>}
          {!loading && error && <p className="text-red-600">{error}</p>}
          {!loading && !error && job && (
            <div className="space-y-3">
              {companyName && (
                <p>
                  <span className="font-medium text-gray-800">Company:</span>{' '}
                  {companyName}
                </p>
              )}
              {(job.location || job.city) && (
                <p>
                  <span className="font-medium text-gray-800">Location:</span>{' '}
                  {job.location ||
                    [job.address, job.city, job.state, job.zip_code].filter(Boolean).join(', ')}
                </p>
              )}
              {job.skill_class && (
                <p>
                  <span className="font-medium text-gray-800">Trade:</span> {job.skill_class}
                </p>
              )}
              {(rateLabel || job.hours_per_day != null || job.days != null) && (
                <p className="text-gray-800">
                  {[rateLabel, job.hours_per_day != null ? `${job.hours_per_day} hrs/day` : null, job.days != null ? `${job.days} day${job.days !== 1 ? 's' : ''}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {(job.scheduled_start_at || job.scheduled_end_at) && (
                <p>
                  <span className="font-medium text-gray-800">Schedule:</span>{' '}
                  {formatDate(job.scheduled_start_at)} — {formatDate(job.scheduled_end_at)}
                </p>
              )}
              {job.description && (
                <div>
                  <p className="font-medium text-gray-800 mb-1">Description</p>
                  <p className="whitespace-pre-wrap text-gray-600 leading-relaxed">{job.description}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 flex flex-wrap justify-end gap-2 shrink-0 bg-gray-50/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/jobs/${jobId}`);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open full job page
          </button>
        </div>
      </div>
    </div>
  );
};

const TECH_HOME_MARKER = {
  fill: '#dc2626',
  stroke: '#ffffff',
};

const TECH_JOB_MARKER = {
  fill: '#16a34a',
  stroke: '#ffffff',
  selectedFill: '#15803d',
};

/** Green circle with "$" for job pins (data URL for Marker icon). */
function svgDollarJobMarkerUrl(fillColor, strokeColor, radiusPx) {
  const pad = 3;
  const size = radiusPx * 2 + pad * 2;
  const c = size / 2;
  const fontSize = Math.max(10, Math.round(radiusPx * 1.05));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${radiusPx}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/><text x="${c}" y="${c}" dominant-baseline="central" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-weight="700" font-size="${fontSize}">$</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** When jobs share the technician's coordinates (0 mi), spread pins in a small ring so job markers aren't hidden under the home marker. */
function displayPositionsForJobMarkers(jobs, homeLatLng) {
  if (!jobs?.length) return [];
  const clusterMi = 0.18;
  return jobs.map((job, idx) => {
    const lat = Number(job.latitude);
    const lng = Number(job.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat, lng };
    if (!homeLatLng) return { lat, lng };
    const mi = haversineMiles(homeLatLng.lat, homeLatLng.lng, lat, lng);
    if (mi > clusterMi) return { lat, lng };
    const ring = Math.floor(idx / 8);
    const slot = idx % 8;
    const theta = (slot / 8) * 2 * Math.PI + ring * 0.55;
    const rDeg = 0.00034 * (ring + 1);
    return {
      lat: lat + rDeg * Math.cos(theta),
      lng: lng + (rDeg * Math.sin(theta)) / Math.cos((lat * Math.PI) / 180),
    };
  });
}

const TechnicianOpenJobsMap = ({
  technicianProfile,
  jobs,
  selectedMapJobId,
  onSelectJob,
  mapPanNonce = 0,
  viewerTechnicianProfileId = null,
}) => {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markersRef = useRef([]);
  const geocodeCacheRef = useRef(new Map());
  const geocodeInFlightRef = useRef(new Set());
  const [mapsReady, setMapsReady] = useState(googleMapsLoaded || Boolean(window.google?.maps));
  const [loadError, setLoadError] = useState(null);
  const [fallbackCoordsByJobId, setFallbackCoordsByJobId] = useState({});
  const [presenceMarkers, setPresenceMarkers] = useState([]);

  const technicianLat = Number(technicianProfile?.latitude);
  const technicianLng = Number(technicianProfile?.longitude);
  const hasTechnicianCoords = Number.isFinite(technicianLat) && Number.isFinite(technicianLng);
  const homeLatLng = useMemo(
    () => (hasTechnicianCoords ? { lat: technicianLat, lng: technicianLng } : null),
    [hasTechnicianCoords, technicianLat, technicianLng]
  );

  const homeAddressQuery = useMemo(
    () =>
      [
        technicianProfile?.address,
        technicianProfile?.city,
        technicianProfile?.state,
        technicianProfile?.zip_code,
        technicianProfile?.country,
      ]
        .filter((part) => String(part || '').trim())
        .join(', '),
    [
      technicianProfile?.address,
      technicianProfile?.city,
      technicianProfile?.state,
      technicianProfile?.zip_code,
      technicianProfile?.country,
    ]
  );

  const normalizedJobs = useMemo(
    () =>
      (jobs || [])
        .map((job) => {
          const lat = Number(job?.latitude);
          const lng = Number(job?.longitude);
          const fallbackCoords = fallbackCoordsByJobId[job?.id];
          const fallbackLat = Number(fallbackCoords?.lat);
          const fallbackLng = Number(fallbackCoords?.lng);
          const resolvedLat = Number.isFinite(lat) ? lat : fallbackLat;
          const resolvedLng = Number.isFinite(lng) ? lng : fallbackLng;
          if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng)) return null;
          return { ...job, latitude: resolvedLat, longitude: resolvedLng };
        })
        .filter(Boolean),
    [jobs, fallbackCoordsByJobId]
  );

  const selectedMapJob = useMemo(
    () => normalizedJobs.find((job) => job.id === selectedMapJobId) || null,
    [normalizedJobs, selectedMapJobId]
  );

  const selectedLatLng = useMemo(() => {
    if (!Number.isFinite(selectedMapJob?.latitude) || !Number.isFinite(selectedMapJob?.longitude)) return null;
    return { lat: selectedMapJob.latitude, lng: selectedMapJob.longitude };
  }, [selectedMapJob?.latitude, selectedMapJob?.longitude]);

  const fallbackQuery = hasTechnicianCoords
    ? `${technicianLat},${technicianLng}`
    : (homeAddressQuery || selectedMapJob?.location || normalizedJobs[0]?.location || 'United States');
  const fallbackEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&z=10&output=embed`;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (!cancelled) {
          setMapsReady(true);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || 'Map unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    techPresenceAPI
      .list()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.markers) ? res.markers : [];
        const selfId =
          viewerTechnicianProfileId != null ? `real-${viewerTechnicianProfileId}` : null;
        setPresenceMarkers(selfId ? list.filter((m) => m.id !== selfId) : list);
      })
      .catch(() => {
        if (!cancelled) setPresenceMarkers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerTechnicianProfileId]);

  useEffect(() => {
    if (!mapsReady || !window.google?.maps?.Geocoder) return;
    const needsResolution = (jobs || []).filter((job) => {
      const hasCoords = Number.isFinite(Number(job?.latitude)) && Number.isFinite(Number(job?.longitude));
      const hasFallback = Number.isFinite(Number(fallbackCoordsByJobId[job?.id]?.lat)) && Number.isFinite(Number(fallbackCoordsByJobId[job?.id]?.lng));
      return !hasCoords && !hasFallback;
    });
    if (!needsResolution.length) return;

    const geocoder = new window.google.maps.Geocoder();
    let cancelled = false;
    needsResolution.slice(0, 25).forEach((job) => {
      const query = [job?.address, job?.city, job?.state, job?.zip_code, job?.country, job?.location]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ');
      if (!query) return;
      if (geocodeCacheRef.current.has(query)) {
        const cached = geocodeCacheRef.current.get(query);
        if (cached) {
          setFallbackCoordsByJobId((prev) => ({ ...prev, [job.id]: cached }));
        }
        return;
      }
      if (geocodeInFlightRef.current.has(query)) return;
      geocodeInFlightRef.current.add(query);
      geocoder.geocode({ address: query, region: 'us', componentRestrictions: { country: 'US' } }, (results, status) => {
        if (cancelled) return;
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          geocodeCacheRef.current.set(query, null);
          geocodeInFlightRef.current.delete(query);
          return;
        }
        const loc = results[0].geometry.location;
        const coords = { lat: loc.lat(), lng: loc.lng() };
        geocodeCacheRef.current.set(query, coords);
        geocodeInFlightRef.current.delete(query);
        setFallbackCoordsByJobId((prev) => ({
          ...prev,
          [job.id]: coords,
        }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mapsReady, jobs, fallbackCoordsByJobId]);

  useEffect(() => {
    if (!mapsReady || !mapContainerRef.current || !window.google?.maps) return;

    const maps = window.google.maps;
    const defaultCenter = homeLatLng || selectedLatLng || { lat: 39.5, lng: -98.35 };
    if (!mapRef.current) {
      mapRef.current = new maps.Map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: homeLatLng ? 11 : 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const markerDisplayPositions = displayPositionsForJobMarkers(normalizedJobs, homeLatLng);

    // Draw home first with lower z-index so overlapping job markers (above) stay visible.
    if (homeLatLng) {
      markersRef.current.push(
        new maps.Marker({
          map: mapRef.current,
          position: homeLatLng,
          title: 'Your location',
          icon: {
            path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
            fillColor: TECH_HOME_MARKER.fill,
            fillOpacity: 1,
            strokeColor: TECH_HOME_MARKER.stroke,
            strokeWeight: 2,
            scale: 6,
            rotation: 0,
          },
          zIndex: 100,
        })
      );
    }

    (presenceMarkers || []).forEach((m) => {
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const fill =
        m.color ||
        (m.marker_type === 'simulated' ? '#64748b' : '#3b82f6');
      markersRef.current.push(
        new maps.Marker({
          map: mapRef.current,
          position: { lat, lng },
          title: m.trade_label ? `${m.trade_label} (network)` : 'Technician',
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: fill,
            fillOpacity: 0.88,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          zIndex: 350,
        })
      );
    });

    normalizedJobs.forEach((job, idx) => {
      const isSelected = job.id === selectedMapJobId;
      const pos = markerDisplayPositions[idx] || { lat: job.latitude, lng: job.longitude };
      const jobRadius = isSelected ? 11 : 9;
      const jobIconSize = jobRadius * 2 + 6;
      const fill = isSelected ? TECH_JOB_MARKER.selectedFill : TECH_JOB_MARKER.fill;
      const jobIconUrl = svgDollarJobMarkerUrl(fill, TECH_JOB_MARKER.stroke, jobRadius);
      const marker = new maps.Marker({
        map: mapRef.current,
        position: { lat: pos.lat, lng: pos.lng },
        title: job.title || `Job #${job.id}`,
        animation: isSelected ? maps.Animation.DROP : undefined,
        icon: {
          url: jobIconUrl,
          scaledSize: new maps.Size(jobIconSize, jobIconSize),
          anchor: new maps.Point(jobIconSize / 2, jobIconSize / 2),
        },
        zIndex: isSelected ? 900 : 800,
      });
      marker.addListener('click', () => {
        onSelectJob?.(job.id);
      });
      markersRef.current.push(marker);
    });

    const DEFAULT_VIEW_RADIUS_MI = 100;
    if (homeLatLng) {
      const radiusMeters = DEFAULT_VIEW_RADIUS_MI * 1609.344;
      const radiusCircle = new maps.Circle({ center: homeLatLng, radius: radiusMeters });
      const radiusBounds = radiusCircle.getBounds();
      if (radiusBounds) {
        mapRef.current.fitBounds(radiusBounds, 48);
      } else {
        mapRef.current.setCenter(homeLatLng);
        mapRef.current.setZoom(10);
      }
    } else if (selectedLatLng || normalizedJobs.length || presenceMarkers.length) {
      const bounds = new maps.LatLngBounds();
      if (selectedLatLng) {
        bounds.extend(selectedLatLng);
      } else {
        markerDisplayPositions.forEach((pos) => bounds.extend(pos));
      }
      presenceMarkers.forEach((m) => {
        const lat = Number(m.latitude);
        const lng = Number(m.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) bounds.extend({ lat, lng });
      });
      if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, 90);
      } else {
        mapRef.current.setCenter(selectedLatLng || defaultCenter);
        mapRef.current.setZoom(normalizedJobs.length ? 9 : 6);
      }
    } else {
      mapRef.current.setCenter(homeLatLng || selectedLatLng || defaultCenter);
      mapRef.current.setZoom(homeLatLng ? 11 : normalizedJobs.length ? 9 : 6);
    }

    // Maps embedded in flex/grid often need a resize tick before markers/tiles paint reliably.
    const mapEl = mapRef.current;
    requestAnimationFrame(() => {
      maps.event.trigger(mapEl, 'resize');
    });
    const resizeLater = window.setTimeout(() => {
      maps.event.trigger(mapEl, 'resize');
    }, 200);
    return () => window.clearTimeout(resizeLater);
  }, [
    mapsReady,
    homeLatLng,
    selectedLatLng,
    selectedMapJobId,
    normalizedJobs,
    onSelectJob,
    mapPanNonce,
    presenceMarkers,
  ]);

  // Parent bumps mapPanNonce when the user asks to focus a job ("Show on map", list row, or marker click).
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !selectedLatLng || mapPanNonce < 1) return;
    const map = mapRef.current;
    map.panTo(selectedLatLng);
    const z = map.getZoom();
    if (z < 12) map.setZoom(13);
  }, [mapsReady, mapPanNonce, selectedLatLng]);

  if (loadError) {
    const keyMissing = !GOOGLE_MAPS_API_KEY;
    const hint = keyMissing
      ? 'Add VITE_GOOGLE_MAPS_API_KEY to skilled-hub-frontend/.env (enable the Maps JavaScript API for this key), then restart the Vite dev server. Without it, only this preview opens — blue job pins need the interactive map.'
      : 'The Maps script failed to load. Confirm the API key, billing, and that “Maps JavaScript API” is enabled for your Google Cloud project.';
    return (
      <div className="relative h-full w-full min-h-[24rem] bg-slate-200">
        <iframe
          title="Open jobs map area view"
          src={fallbackEmbedUrl}
          className="h-full w-full min-h-[24rem] border-0"
          loading="eager"
          fetchPriority="high"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-slate-900/88 px-3 py-2.5 text-xs text-white shadow-lg">
          <p className="font-semibold text-amber-200">Preview map — job markers unavailable</p>
          <p className="mt-1 leading-snug text-slate-100">{hint}</p>
        </div>
      </div>
    );
  }

  if (!mapsReady) {
    return (
      <div className="h-full w-full min-h-[24rem] flex items-center justify-center bg-slate-100 text-gray-500 text-sm">
        Loading map...
      </div>
    );
  }

  return <div ref={mapContainerRef} className="h-full w-full min-h-[24rem]" />;
};

const DashboardStatSkeleton = () => (
  <div className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 animate-pulse">
    <div className="w-8 h-8 rounded bg-gray-200" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-20 bg-gray-200 rounded" />
      <div className="h-7 w-12 bg-gray-200 rounded" />
    </div>
  </div>
);

const CompanyDashboardContent = ({
  jobs,
  jobsLoading,
  analytics,
  analyticsLoading,
  onFinish,
  navigate,
  showWelcome = false,
}) => {
  const now = Date.now();
  const counts = jobs?.counts;
  const requested = sortByMostRecent(jobs?.requested || []);
  const unrequested = jobs?.unrequested || [];
  const openJobs = sortByMostRecent(unrequested.filter(j => {
    const endAt = j.scheduled_end_at ? new Date(j.scheduled_end_at).getTime() : null;
    return endAt === null || endAt >= now;
  }));
  const expiredOpen = sortByMostRecent(unrequested.filter(j => {
    const endAt = j.scheduled_end_at ? new Date(j.scheduled_end_at).getTime() : null;
    return endAt !== null && endAt < now;
  }));
  const completed = sortByMostRecent(jobs?.expired || []);
  const tableJobs = [...requested, ...openJobs, ...expiredOpen, ...completed].slice(0, 25);
  const totalJobs = counts?.total ?? tableJobs.length;
  const openCount = counts?.unrequested ?? openJobs.length;
  const activeCount = analytics?.jobs_active ?? requested.filter((j) => {
    const startAt = j.scheduled_start_at ? new Date(j.scheduled_start_at).getTime() : null;
    return startAt !== null && startAt <= now;
  }).length;
  const completedCount = counts?.completed ?? completed.length;
  const statsLoading = jobsLoading && !counts && !jobs?.requested;

  return (
    <>
      {showWelcome && (
        <div className="mb-8 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-950 shadow-sm">
          <p className="font-semibold text-lg mb-1">Welcome aboard!</p>
          <p className="text-sm text-blue-900/90 mb-4">
            You&rsquo;re set up on TechFlash. Post a job to hire technicians, or explore your dashboard below.
          </p>
          <Link
            to="/jobs/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FE6711] text-white text-sm font-semibold hover:opacity-95 shadow"
          >
            Post a job
          </Link>
        </div>
      )}
      {analyticsLoading && !analytics && (
        <div className="mb-8 h-48 rounded-2xl bg-white shadow animate-pulse" />
      )}
      {analytics && <CompanyAnalyticsCharts analytics={analytics} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statsLoading ? (
          <>
            <DashboardStatSkeleton />
            <DashboardStatSkeleton />
            <DashboardStatSkeleton />
            <DashboardStatSkeleton />
          </>
        ) : (
          <>
        <Link
          to="/jobs"
          className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <FaBriefcase className="text-2xl text-blue-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Total Jobs</div>
            <div className="text-2xl font-bold text-gray-800">{totalJobs}</div>
          </div>
        </Link>
        <Link
          to="/jobs?status=active"
          className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <FaWrench className="text-2xl text-yellow-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Active</div>
            <div className="text-2xl font-bold text-gray-800">{activeCount}</div>
          </div>
        </Link>
        <Link
          to="/jobs?status=open"
          className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <FaFolderOpen className="text-2xl text-blue-500" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Open</div>
            <div className="text-2xl font-bold text-gray-800">{openCount}</div>
          </div>
        </Link>
        <Link
          to="/jobs?status=completed"
          className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <FaCheckSquare className="text-2xl text-green-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Completed</div>
            <div className="text-2xl font-bold text-gray-800">{completedCount}</div>
          </div>
        </Link>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Recent Jobs</h2>
          <div className="flex gap-2">
            {counts?.total > tableJobs.length && (
              <Link to="/jobs" className="text-sm text-blue-600 hover:underline self-center">
                View all {counts.total} jobs
              </Link>
            )}
            <button
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg shadow"
              onClick={() => navigate('/jobs/create')}
            >
              Create Job
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {jobsLoading && tableJobs.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
              Loading jobs…
            </div>
          ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job Title</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tableJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No jobs yet. <Link to="/jobs/create" className="text-blue-600 hover:underline">Create your first job</Link>
                  </td>
                </tr>
              ) : (
                tableJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-2 font-medium text-gray-800">{job.title}</td>
                    <td className="px-4 py-2">{statusLabel(job)}</td>
                    <td className="px-4 py-2">{new Date(job.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{formatDate(job.scheduled_start_at)}</td>
                    <td className="px-4 py-2">{formatDate(job.scheduled_end_at)}</td>
                    <td className="px-4 py-2 flex space-x-2">
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm" onClick={() => navigate(`/jobs/${job.id}/edit`)}>Edit</button>
                      <button className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm" onClick={() => navigate(`/jobs/${job.id}`)}>View</button>
                      {(job.status === 'reserved' || job.status === 'filled') && (
                        <button className="bg-green-200 hover:bg-green-300 text-green-800 px-3 py-1 rounded text-sm" onClick={() => onFinish(job.id)}>Mark Complete</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </>
  );
};

const TechnicianDashboardContent = ({
  jobs,
  jobsLoading,
  openJobs,
  openJobsLoading,
  technicianProfile,
  profileLoading,
  analytics,
  analyticsLoading,
  navigate,
  user,
}) => {
  const inProgress = jobs?.in_progress || [];
  const completed = jobs?.completed || [];
  const [selectedMapJobId, setSelectedMapJobId] = useState(null);
  const [nearbyJobPreviewId, setNearbyJobPreviewId] = useState(null);
  const [nearbyPreviewJob, setNearbyPreviewJob] = useState(null);
  const [nearbyPreviewLoading, setNearbyPreviewLoading] = useState(false);
  const [nearbyPreviewError, setNearbyPreviewError] = useState(null);
  const [reviewedJobIds, setReviewedJobIds] = useState(new Set());
  /** Incremented when the user explicitly focuses a job so the map pans/zooms (fitBounds alone is often invisible). */
  const [mapPanNonce, setMapPanNonce] = useState(0);
  const searchRadiusMiles = 100;
  const technicianLat = Number(technicianProfile?.latitude);
  const technicianLng = Number(technicianProfile?.longitude);

  const nearbyOpenJobs = useMemo(
    () => filterJobsWithinRadius(openJobs, technicianLat, technicianLng, searchRadiusMiles),
    [openJobs, technicianLat, technicianLng]
  );

  const mapDisplayJobs = useMemo(() => {
    if (nearbyOpenJobs.length > 0) return nearbyOpenJobs;
    return filterJobsWithinRadius(openJobs, technicianLat, technicianLng, Number.POSITIVE_INFINITY);
  }, [nearbyOpenJobs, openJobs, technicianLat, technicianLng]);

  useEffect(() => {
    if (!mapDisplayJobs.length) {
      setSelectedMapJobId(null);
      return;
    }
    const stillExists = mapDisplayJobs.some((job) => job.id === selectedMapJobId);
    if (!stillExists) {
      setSelectedMapJobId(mapDisplayJobs[0].id);
    }
  }, [mapDisplayJobs, selectedMapJobId]);

  useEffect(() => {
    if (nearbyJobPreviewId == null) {
      setNearbyPreviewJob(null);
      setNearbyPreviewError(null);
      setNearbyPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setNearbyPreviewLoading(true);
    setNearbyPreviewError(null);
    jobsAPI
      .getById(nearbyJobPreviewId)
      .then((data) => {
        if (!cancelled) setNearbyPreviewJob(data);
      })
      .catch(() => {
        if (!cancelled) setNearbyPreviewError('Could not load this job. Try again or open the full job page.');
      })
      .finally(() => {
        if (!cancelled) setNearbyPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nearbyJobPreviewId]);

  useEffect(() => {
    if (user?.role === 'technician') {
      ratingsAPI.getReviewedJobIds()
        .then((res) => setReviewedJobIds(new Set(res.job_ids || [])))
        .catch(() => setReviewedJobIds(new Set()));
    }
  }, [user?.role]);

  const nearbyPreviewDistance = mapDisplayJobs.find((job) => job.id === nearbyJobPreviewId)?.distanceMiles;
  const needsExactAddressPrompt = needsTechnicianMapSetup(technicianProfile);

  const openNearbyJobPreview = (jobId) => {
    setSelectedMapJobId(jobId);
    setNearbyJobPreviewId(jobId);
    setMapPanNonce((n) => n + 1);
  };

  return (
    <>
      <TechnicianNearbyJobPreviewModal
        jobId={nearbyJobPreviewId}
        job={nearbyPreviewJob}
        loading={nearbyPreviewLoading}
        error={nearbyPreviewError}
        distanceMiles={nearbyPreviewDistance}
        onClose={() => setNearbyJobPreviewId(null)}
        navigate={navigate}
      />
      {needsExactAddressPrompt && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm">
          <p className="font-semibold text-sm sm:text-base mb-1">Add your exact address for better map matching</p>
          <p className="text-sm text-amber-900/90 mb-3">
            We have your city, but adding your full street address improves map centering and nearby job distance accuracy.
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
          >
            Add address in Settings
          </Link>
        </div>
      )}

      <section className="mb-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-3">
          <div className="xl:col-span-2 min-h-[24rem] bg-slate-100 relative">
            {openJobsLoading && openJobs.length === 0 ? (
              <div className="h-full min-h-[24rem] flex items-center justify-center text-gray-500 text-sm">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
                  Loading open jobs map…
                </div>
              </div>
            ) : (
              <>
            <TechnicianOpenJobsMap
              technicianProfile={technicianProfile}
              jobs={mapDisplayJobs}
              selectedMapJobId={selectedMapJobId}
              mapPanNonce={mapPanNonce}
              onSelectJob={(jobId) => openNearbyJobPreview(jobId)}
              viewerTechnicianProfileId={technicianProfile?.id}
            />
            {openJobs.length === 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
                <div className="rounded-full bg-slate-900/45 text-white text-xs sm:text-sm px-4 py-2 backdrop-blur-[1px] max-w-md text-center leading-snug">
                  No open jobs match your account yet (not only distance—tier timing, experience vs. each job, and profile
                  rules apply)
                </div>
              </div>
            )}
            {openJobs.length > 0 && mapDisplayJobs.length === 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
                <div className="rounded-full bg-amber-900/55 text-white text-xs sm:text-sm px-4 py-2 backdrop-blur-[1px] max-w-lg text-center">
                  No open listings within {searchRadiusMiles} miles of your profile.
                </div>
              </div>
            )}
              </>
            )}
          </div>
          <div className="border-t xl:border-t-0 xl:border-l border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Open Jobs Map</h2>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                Live
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Open listings refresh every 30 seconds. Jobs are filtered server-side by membership rules (including experience
              vs. each posting); we then prioritize pins within {searchRadiusMiles} miles of your profile when coordinates are
              available.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {mapDisplayJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => openNearbyJobPreview(job.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition cursor-pointer ${
                    selectedMapJobId === job.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">{job.title}</p>
                  <p className="text-xs text-gray-600 line-clamp-1">
                    {job.location || 'Location pending'}
                    {Number.isFinite(job.distanceMiles) ? ` • ${formatDistanceMi(job.distanceMiles)}` : ''}
                  </p>
                  <div className="mt-2 flex justify-end">
                    <span className="text-xs font-medium text-blue-700">Show on map</span>
                  </div>
                </button>
              ))}
              {!mapDisplayJobs.length && (
                <div className="text-sm text-gray-500 space-y-2">
                  <p>No open jobs to show on the map right now.</p>
                  <p className="text-xs text-gray-500">
                    If the jobs board looks quiet but companies have postings, confirm your years of experience and profile in
                    Settings meet each listing&apos;s requirements. Premium speeds tier timing—it does not skip job minimum
                    experience.
                  </p>
                  <Link to="/settings" className="inline-block text-xs font-medium text-blue-700 hover:underline">
                    Open Settings
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {analyticsLoading && !analytics && (
        <div className="mb-8 h-48 rounded-2xl bg-white shadow animate-pulse" />
      )}
      {analytics && <TechnicianAnalyticsCharts analytics={analytics} />}

      {(jobsLoading && !jobs) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <DashboardStatSkeleton />
          <DashboardStatSkeleton />
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <Link
          to="/jobs?status=active"
          className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <FaWrench className="text-2xl text-yellow-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">In Progress</div>
            <div className="text-2xl font-bold text-gray-800">{inProgress.length}</div>
          </div>
        </Link>
        <Link
          to="/jobs?status=completed"
          className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <FaCheckSquare className="text-2xl text-green-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Completed</div>
            <div className="text-2xl font-bold text-gray-800">{completed.length}</div>
          </div>
        </Link>
      </div>
      )}

      <div className="space-y-8">
        {inProgress.length > 0 && (
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Jobs In Progress</h2>
            <div className="space-y-3">
              {inProgress.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="font-medium text-gray-800">{job.title}</div>
                    <div className="text-sm text-gray-500">{job.company_profile?.company_name} • {job.location}</div>
                  </div>
                  <button
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Completed Jobs</h2>
          {completed.length === 0 ? (
            <p className="text-gray-500 py-4">No completed jobs yet. Complete a job and the company will mark it as finished.</p>
          ) : (
            <div className="space-y-3">
              {completed.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="font-medium text-gray-800">{job.title}</div>
                    <div className="text-sm text-gray-500">{job.company_profile?.company_name} • {job.location}</div>
                  </div>
                  <button
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    {reviewedJobIds.has(job.id) ? 'View Past Job' : 'View & Leave Review'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Dashboard;
