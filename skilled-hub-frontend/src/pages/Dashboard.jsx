import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { jobsAPI, ratingsAPI, feedbackAPI, adminAPI, profilesAPI, techPresenceAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import AppHeader from '../components/AppHeader';
import { filterJobsWithinRadius, formatDistanceMi, haversineMiles, needsTechnicianMapSetup } from '../utils/technicianMap';
import { FaBriefcase, FaCheckSquare, FaWrench, FaFolderOpen, FaDollarSign, FaStar, FaChartLine, FaUsers, FaUserCog, FaBuilding, FaCommentDots } from 'react-icons/fa';

// open, claimed (filled but not started), active (in progress), completed, expired
const statusLabel = (job) => {
  if (!job) return <span className="capitalize text-gray-600">—</span>;
  const status = job.status;
  if (status === 'open') {
    const endAt = job.scheduled_end_at ? new Date(job.scheduled_end_at).getTime() : null;
    const now = Date.now();
    if (endAt !== null && endAt < now) {
      return <span className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700">Expired</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Open</span>;
  }
  if (status === 'finished') return <span className="px-2 py-1 text-xs rounded bg-green-200 text-green-800">Completed</span>;
  if (status === 'reserved' || status === 'filled') {
    const startAt = job.scheduled_start_at ? new Date(job.scheduled_start_at).getTime() : null;
    const now = Date.now();
    if (startAt === null || startAt > now) {
      return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">Claimed</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Active</span>;
  }
  return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800 capitalize">{status}</span>;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString();
};

const formatCurrency = (cents) => {
  if (cents == null || cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

const PERIOD_OPTIONS = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

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

const humanizeStatus = (s) => (s == null ? '—' : String(s).replace(/_/g, ' '));

const AdminInsightTable = ({ category, items }) => {
  const classifyTableValue = (value) => {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized === '-' || normalized === '—') return 2;
    if (/^\d+(\.\d+)?$/.test(normalized)) return 1;
    return 0;
  };

  const compareBaseColumnValues = (leftValue, rightValue) => {
    const leftClass = classifyTableValue(leftValue);
    const rightClass = classifyTableValue(rightValue);
    if (leftClass !== rightClass) return leftClass - rightClass;

    if (leftClass === 1) {
      return Number(leftValue) - Number(rightValue);
    }

    return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, {
      sensitivity: 'base',
    });
  };

  const firstColumnValueForCategory = (row) => {
    if (category === 'total_users' || category === 'technicians') return row?.email ?? '';
    if (category === 'companies') return row?.company_name ?? '';
    return '';
  };

  const sortedItems = [...(items || [])].sort((a, b) =>
    compareBaseColumnValues(firstColumnValueForCategory(a), firstColumnValueForCategory(b))
  );

  if (!items?.length) {
    return <p className="text-gray-500 text-sm py-8 text-center">No rows for this time range.</p>;
  }

  if (category === 'total_users') {
    return (
      <div className="overflow-x-auto max-h-[min(70vh,28rem)] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Logins</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Msgs</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Money</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rev. out</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rev. in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedItems.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50/80">
                <td className="px-3 py-2 text-gray-800">{row.email}</td>
                <td className="px-3 py-2 capitalize text-gray-600">{row.role}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.logins}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.messages_sent}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.money_cents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.reviews_given}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.reviews_received}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (category === 'technicians') {
    return (
      <div className="overflow-x-auto max-h-[min(70vh,28rem)] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Trade</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Logins</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Msgs</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Earned</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rev. out</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rev. in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedItems.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50/80">
                <td className="px-3 py-2 text-gray-800">{row.email}</td>
                <td className="px-3 py-2 text-gray-600">{row.trade_type || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.logins}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.messages_sent}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.money_earned_cents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.reviews_given}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.reviews_received}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (category === 'companies') {
    return (
      <div className="overflow-x-auto max-h-[min(70vh,28rem)] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Logins</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Msgs</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Spent</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rev. out</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rev. in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedItems.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50/80">
                <td className="px-3 py-2 font-medium text-gray-800">{row.company_name || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{row.email}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.logins}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.messages_sent}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.money_spent_cents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.reviews_given}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.reviews_received}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (['total_jobs', 'open_jobs', 'jobs_in_progress', 'completed'].includes(category)) {
    return (
      <div className="overflow-x-auto max-h-[min(70vh,28rem)] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Apps</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Msgs</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Reviews</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50/80">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-left font-medium text-blue-700 hover:underline"
                    onClick={() => window.open(`/jobs/${row.id}`, '_blank', 'noopener,noreferrer')}
                  >
                    {row.title || `Job #${row.id}`}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-600">{row.company_name || '—'}</td>
                <td className="px-3 py-2 capitalize text-gray-700">{humanizeStatus(row.status)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.applications_in_period}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.messages_in_period}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.money_released_cents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.ratings_in_period}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (category === 'job_applications') {
    return (
      <div className="overflow-x-auto max-h-[min(70vh,28rem)] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Technician</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50/80">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-left font-medium text-blue-700 hover:underline"
                    onClick={() => window.open(`/jobs/${row.job_id}`, '_blank', 'noopener,noreferrer')}
                  >
                    {row.job_title}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-700">{row.technician_email || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{row.company_name || '—'}</td>
                <td className="px-3 py-2 capitalize">{row.status}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                  {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
};

const AdminTotalsStrip = ({ totals, category }) => {
  if (!totals) return null;
  const chips = [];
  if (totals.count != null) {
    chips.push({
      label: category === 'job_applications' ? 'Applications' : 'Rows',
      value: totals.count,
    });
  }
  if (totals.logins != null) chips.push({ label: 'Logins', value: totals.logins });
  if (totals.messages_sent != null) chips.push({ label: 'Messages (job threads)', value: totals.messages_sent });
  if (totals.money_cents != null) chips.push({ label: 'Money', value: formatCurrency(totals.money_cents) });
  if (totals.reviews != null) chips.push({ label: 'Reviews', value: totals.reviews });
  if (totals.applications != null && ['total_jobs', 'open_jobs', 'jobs_in_progress', 'completed'].includes(category)) {
    chips.push({ label: 'Applications (period)', value: totals.applications });
  }

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {chips.map((c) => (
        <div key={c.label} className="inline-flex items-baseline gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <span className="text-gray-500">{c.label}</span>
          <span className="font-semibold text-gray-900 tabular-nums">{c.value}</span>
        </div>
      ))}
    </div>
  );
};

const Dashboard = ({ user, onLogout }) => {
  const [searchParams] = useSearchParams();
  const showWelcomeBanner = searchParams.get('welcome') === '1';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [openJobs, setOpenJobs] = useState([]);
  const [technicianProfile, setTechnicianProfile] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [feedbackList, setFeedbackList] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'technician') return undefined;
    loadGoogleMapsScript().catch(() => {});
    return undefined;
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'technician') return undefined;
    const refreshOpenJobsOnly = async () => {
      try {
        const openJobsRes = await jobsAPI.getAll({ status: 'open', include_past: 'true' }).catch(() => []);
        const now = Date.now();
        const liveOpenJobs = (Array.isArray(openJobsRes) ? openJobsRes : []).filter((job) => {
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

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      if (user?.role === 'company') {
        setFeedbackList(null);
        const [jobsRes, analyticsRes] = await Promise.all([
          jobsAPI.getDashboard(),
          jobsAPI.getAnalytics().catch(() => null),
        ]);
        setJobs(jobsRes);
        setAnalytics(analyticsRes);
      } else if (user?.role === 'technician') {
        setFeedbackList(null);
        const [jobsRes, analyticsRes, openJobsRes, technicianProfileRes] = await Promise.all([
          jobsAPI.getTechnicianDashboard(),
          jobsAPI.getAnalytics().catch(() => null),
          jobsAPI.getAll({ status: 'open', include_past: 'true' }).catch(() => []),
          profilesAPI.getTechnicianProfile().catch(() => null),
        ]);
        const now = Date.now();
        const liveOpenJobs = (Array.isArray(openJobsRes) ? openJobsRes : []).filter((job) => {
          const endAt = job?.scheduled_end_at ? new Date(job.scheduled_end_at).getTime() : null;
          return endAt == null || endAt >= now;
        });
        // #region agent log
        fetch('http://127.0.0.1:7260/ingest/d67e1fb9-af7e-4677-9ae6-ba8bb7fc57ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f0f940'},body:JSON.stringify({sessionId:'f0f940',runId:'initial',hypothesisId:'H1',location:'Dashboard.jsx:fetchDashboard-technician',message:'technician open jobs payload summary',data:{openJobsCount:Array.isArray(openJobsRes)?openJobsRes.length:-1,liveOpenJobsCount:liveOpenJobs.length,sample:(liveOpenJobs||[]).slice(0,3).map((j)=>({id:j?.id,title:j?.title,lat:j?.latitude,lng:j?.longitude,location:j?.location,address:j?.address}))},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        setJobs(jobsRes);
        setOpenJobs(liveOpenJobs);
        setTechnicianProfile(technicianProfileRes);
        setAnalytics(analyticsRes);
      } else if (user?.role === 'admin') {
        const [analyticsRes, feedbackRes] = await Promise.all([
          jobsAPI.getAnalytics().catch(() => null),
          feedbackAPI.list().catch(() => null),
        ]);
        setJobs(null);
        setOpenJobs([]);
        setTechnicianProfile(null);
        setAnalytics(analyticsRes);
          setFeedbackList(feedbackRes?.feedback_submissions ?? []);
      } else {
        setFeedbackList(null);
        setJobs(null);
        setOpenJobs([]);
        setTechnicianProfile(null);
        setAnalytics(null);
      }
    } catch (err) {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async (jobId) => {
    try {
      await jobsAPI.finish(jobId);
      fetchDashboard();
      window.open(`/jobs/${jobId}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to complete', message: 'Failed to mark job as finished', variant: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} onLogout={onLogout} activePage="dashboard" profileAvatar />
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
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
          {user?.role === 'company' && (
            <CompanyDashboardContent
              jobs={jobs}
              analytics={analytics}
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
              openJobs={openJobs}
              technicianProfile={technicianProfile}
              analytics={analytics}
              navigate={navigate}
              user={user}
            />
          )}
          {user?.role === 'admin' && (
            <AdminDashboardContent analytics={analytics} feedbackList={feedbackList} />
          )}
          {user?.role !== 'company' && user?.role !== 'technician' && user?.role !== 'admin' && (
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

const AdminDashboardContent = ({ analytics, feedbackList }) => {
  const [insightCategory, setInsightCategory] = useState(null);
  const [period, setPeriod] = useState('7d');
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState(null);

  useEffect(() => {
    if (!insightCategory) {
      setInsight(null);
      return undefined;
    }
    let cancelled = false;
    setInsightLoading(true);
    setInsightError(null);
    adminAPI
      .getPlatformInsights(insightCategory, period)
      .then((data) => {
        if (!cancelled) setInsight(data);
      })
      .catch((err) => {
        if (!cancelled) setInsightError(err.message || 'Failed to load details');
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [insightCategory, period]);

  const toggleInsight = (cat) => {
    setInsightCategory((prev) => (prev === cat ? null : cat));
  };

  const ringIf = (cat) => (insightCategory === cat ? 'ring-2 ring-blue-500 ring-offset-2' : '');

  return (
  <>
    <h2 className="text-xl font-semibold text-gray-800 mb-6">Platform Overview</h2>
    {analytics && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
        <button
          type="button"
          onClick={() => toggleInsight('total_users')}
          className={`text-left bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl shadow-lg p-5 text-white ${ringIf('total_users')} hover:brightness-105 transition`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm font-medium">Total Users</p>
              <p className="text-2xl font-bold mt-1">{analytics.total_users ?? 0}</p>
              <p className="text-indigo-200/90 text-xs mt-2">Click for list and metrics</p>
            </div>
            <FaUsers className="text-3xl text-indigo-200/80" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => toggleInsight('technicians')}
          className={`text-left bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-blue-500 ${ringIf('technicians')} hover:shadow-md transition`}
        >
          <div className="flex items-center gap-2">
            <FaUserCog className="text-blue-500" />
            <div>
              <p className="text-gray-500 text-sm font-medium">Technicians</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.technicians_count ?? 0}</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => toggleInsight('companies')}
          className={`text-left bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-amber-500 ${ringIf('companies')} hover:shadow-md transition`}
        >
          <div className="flex items-center gap-2">
            <FaBuilding className="text-amber-500" />
            <div>
              <p className="text-gray-500 text-sm font-medium">Companies</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.companies_count ?? 0}</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => toggleInsight('total_jobs')}
          className={`text-left bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-teal-500 ${ringIf('total_jobs')} hover:shadow-md transition`}
        >
          <p className="text-gray-500 text-sm font-medium">Total Jobs</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.total_jobs ?? 0}</p>
        </button>
        <button
          type="button"
          onClick={() => toggleInsight('job_applications')}
          className={`text-left bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-emerald-500 ${ringIf('job_applications')} hover:shadow-md transition`}
        >
          <p className="text-gray-500 text-sm font-medium">Job Applications</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.total_job_applications ?? 0}</p>
        </button>
      </div>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <button
        type="button"
        onClick={() => toggleInsight('open_jobs')}
        className={`text-left bg-white rounded-2xl shadow p-5 border-l-4 border-blue-400 ${ringIf('open_jobs')} hover:shadow-md transition`}
      >
        <p className="text-gray-500 text-sm font-medium">Open Jobs</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{analytics?.jobs_open ?? 0}</p>
      </button>
      <button
        type="button"
        onClick={() => toggleInsight('jobs_in_progress')}
        className={`text-left bg-white rounded-2xl shadow p-5 border-l-4 border-yellow-400 ${ringIf('jobs_in_progress')} hover:shadow-md transition`}
      >
        <p className="text-gray-500 text-sm font-medium">In Progress</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{analytics?.jobs_in_progress ?? 0}</p>
      </button>
      <button
        type="button"
        onClick={() => toggleInsight('completed')}
        className={`text-left bg-white rounded-2xl shadow p-5 border-l-4 border-green-400 ${ringIf('completed')} hover:shadow-md transition`}
      >
        <p className="text-gray-500 text-sm font-medium">Completed</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{analytics?.jobs_finished ?? 0}</p>
      </button>
    </div>

    {insightCategory && (
      <section className="mt-8 bg-white rounded-2xl shadow border border-gray-100 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{insight?.label || 'Details'}</h3>
            <p className="text-sm text-gray-500 mt-1">
              Metrics below respect the selected time window. Logins are counted from successful sign-ins (tracked from deployment of login history).
              {insight?.since ? (
                <span className="block mt-1">Window start: {new Date(insight.since).toLocaleString()}</span>
              ) : (
                <span className="block mt-1">All time — no start filter.</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  period === opt.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setInsightCategory(null)}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>

        {insightLoading && <p className="text-gray-500 text-sm py-6">Loading…</p>}
        {insightError && <p className="text-red-600 text-sm py-2">{insightError}</p>}
        {!insightLoading && insight && !insightError && (
          <>
            <AdminTotalsStrip totals={insight.totals} category={insight.category} />
            <AdminInsightTable category={insight.category} items={insight.items} />
          </>
        )}
      </section>
    )}

    <div className="mt-8 flex flex-wrap gap-4">
      <Link
        to="/crm"
        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-medium"
      >
        <FaBuilding /> Company CRM
      </Link>
      <Link
        to="/jobs"
        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
      >
        <FaBriefcase /> View All Jobs
      </Link>
    </div>

    <section className="mt-12 border-t border-gray-200 pt-10">
      <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
        <FaCommentDots className="text-orange-500" /> User feedback
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Messages sent from the Feedback button (logged-in technicians and companies). Submissions are also emailed to admin accounts when mail is configured.
      </p>
      {feedbackList === null ? (
        <p className="text-gray-500 text-sm">Loading feedback…</p>
      ) : feedbackList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
          No feedback yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto max-h-[min(70vh,32rem)] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">When</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Page</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {feedbackList.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-gray-50/80">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{row.user_email || '—'}</div>
                      <div className="text-xs text-gray-500 capitalize">{row.user_role || '-'}</div>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700">{row.kind || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[12rem] truncate" title={row.page_path || ''}>
                      {row.page_path || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-800 whitespace-pre-wrap max-w-xl">{row.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  </>
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
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="Close job preview"
        onClick={onClose}
      />
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
  const homeLatLng = hasTechnicianCoords ? { lat: technicianLat, lng: technicianLng } : null;

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

  const selectedLatLng =
    Number.isFinite(selectedMapJob?.latitude) && Number.isFinite(selectedMapJob?.longitude)
      ? { lat: selectedMapJob.latitude, lng: selectedMapJob.longitude }
      : null;

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
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/d67e1fb9-af7e-4677-9ae6-ba8bb7fc57ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f0f940'},body:JSON.stringify({sessionId:'f0f940',runId:'initial',hypothesisId:'H2',location:'Dashboard.jsx:TechnicianOpenJobsMap-geocodeEffect',message:'geocode fallback eligibility',data:{mapsReady,jobsCount:(jobs||[]).length,needsResolutionCount:needsResolution.length,sample:(needsResolution||[]).slice(0,3).map((j)=>({id:j?.id,title:j?.title,location:j?.location,address:j?.address,city:j?.city,state:j?.state}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7260/ingest/d67e1fb9-af7e-4677-9ae6-ba8bb7fc57ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f0f940'},body:JSON.stringify({sessionId:'f0f940',runId:'initial',hypothesisId:'H3',location:'Dashboard.jsx:TechnicianOpenJobsMap-geocodeCallback',message:'geocode callback result',data:{jobId:job?.id,status,hasResult:Boolean(results?.[0]?.geometry?.location),queryPreview:query.slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/d67e1fb9-af7e-4677-9ae6-ba8bb7fc57ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f0f940'},body:JSON.stringify({sessionId:'f0f940',runId:'initial',hypothesisId:'H4',location:'Dashboard.jsx:TechnicianOpenJobsMap-markerEffect',message:'marker render summary',data:{mapsReady,normalizedJobsCount:normalizedJobs.length,selectedMapJobId,markerCount:markersRef.current.length,homeLatLngPresent:Boolean(homeLatLng),sample:(normalizedJobs||[]).slice(0,3).map((j)=>({id:j.id,lat:j.latitude,lng:j.longitude}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (homeLatLng && (selectedLatLng || normalizedJobs.length || presenceMarkers.length)) {
      const bounds = new maps.LatLngBounds();
      bounds.extend(homeLatLng);
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
      mapRef.current.fitBounds(bounds, 90);
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

const CompanyDashboardContent = ({ jobs, analytics, onFinish, onRefresh, navigate, user, showWelcome = false }) => {
  const now = Date.now();
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
  const allJobs = [...requested, ...openJobs, ...expiredOpen, ...completed];
  const openCount = openJobs.length;
  // Active = claimed and in progress (started); must match backend filter for status=active
  const activeCount = requested.filter((j) => {
    const startAt = j.scheduled_start_at ? new Date(j.scheduled_start_at).getTime() : null;
    return startAt !== null && startAt <= now;
  }).length;
  const completedCount = completed.length;

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
      {/* Analytics Section */}
      {analytics && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FaChartLine className="text-blue-600" /> Analytics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl shadow-lg p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Total Spent</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(analytics.total_spent_cents)}</p>
                </div>
                <FaDollarSign className="text-3xl text-emerald-200/80" />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-blue-500">
              <p className="text-gray-500 text-sm font-medium">Jobs Completed</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.jobs_completed ?? completedCount}</p>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-amber-500">
              <p className="text-gray-500 text-sm font-medium">Technicians Hired</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.unique_technicians_hired ?? 0}</p>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-indigo-500">
              <p className="text-gray-500 text-sm font-medium">Total Jobs Posted</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.jobs_posted ?? allJobs.length}</p>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-teal-500">
              <p className="text-gray-500 text-sm font-medium">Active Jobs</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.jobs_active ?? activeCount}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link
          to="/jobs"
          className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <FaBriefcase className="text-2xl text-blue-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Total Jobs</div>
            <div className="text-2xl font-bold text-gray-800">{allJobs.length}</div>
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
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">My Jobs</h2>
          <button
            className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg shadow"
            onClick={() => navigate('/jobs/create')}
          >
            Create Job
          </button>
        </div>
        <div className="overflow-x-auto">
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
              {allJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No jobs yet. <Link to="/jobs/create" className="text-blue-600 hover:underline">Create your first job</Link>
                  </td>
                </tr>
              ) : (
                allJobs.map((job) => (
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
        </div>
      </div>
    </>
  );
};

const TechnicianDashboardContent = ({ jobs, openJobs, technicianProfile, analytics, navigate, user }) => {
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

  const selectedMapJob = mapDisplayJobs.find((job) => job.id === selectedMapJobId) || null;
  const nearbyPreviewDistance = mapDisplayJobs.find((job) => job.id === nearbyJobPreviewId)?.distanceMiles;
  const needsExactAddressPrompt = needsTechnicianMapSetup(technicianProfile);

  const openNearbyJobPreview = (jobId) => {
    setSelectedMapJobId(jobId);
    setNearbyJobPreviewId(jobId);
    setMapPanNonce((n) => n + 1);
  };

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/d67e1fb9-af7e-4677-9ae6-ba8bb7fc57ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f0f940'},body:JSON.stringify({sessionId:'f0f940',runId:'initial',hypothesisId:'H5',location:'Dashboard.jsx:TechnicianDashboardContent-nearbyJobs',message:'nearby jobs computed',data:{openJobsCount:(openJobs||[]).length,nearbyOpenJobsCount:nearbyOpenJobs.length,selectedMapJobId,technicianLat,technicianLng,sample:(nearbyOpenJobs||[]).slice(0,3).map((j)=>({id:j?.id,title:j?.title,distanceMiles:j?.distanceMiles,lat:j?.latitude,lng:j?.longitude}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [openJobs, nearbyOpenJobs, selectedMapJobId, technicianLat, technicianLng]);

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
                <div className="rounded-full bg-slate-900/45 text-white text-xs sm:text-sm px-4 py-2 backdrop-blur-[1px]">
                  No jobs available in your area right now
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
          </div>
          <div className="border-t xl:border-t-0 xl:border-l border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Open Jobs Map</h2>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                Live
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Open listings here refresh every 30 seconds without reloading the rest of the dashboard. We prioritize jobs within{' '}
              {searchRadiusMiles} miles of your profile.
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
              {!mapDisplayJobs.length && <p className="text-sm text-gray-500">No open jobs available right now.</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Analytics Section */}
      {analytics && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FaChartLine className="text-blue-600" /> Analytics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl shadow-lg p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Total Earned</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(analytics.total_earned_cents)}</p>
                </div>
                <FaDollarSign className="text-3xl text-emerald-200/80" />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-amber-500">
              <p className="text-gray-500 text-sm font-medium">Pending Earnings</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(analytics.pending_earned_cents)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-cyan-500">
              <p className="text-gray-500 text-sm font-medium">Earned (7 days)</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(analytics.earned_this_week_cents)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-blue-500">
              <p className="text-gray-500 text-sm font-medium">Jobs Completed</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.jobs_completed ?? completed.length}</p>
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-indigo-500">
              <div className="flex items-center gap-2">
                <FaStar className="text-amber-500" />
                <div>
                  <p className="text-gray-500 text-sm font-medium">Average Rating</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">
                    {analytics.average_rating != null ? `${Number(analytics.average_rating).toFixed(1)} / 5` : '—'}
                  </p>
                </div>
              </div>
              {analytics.reviews_count > 0 && (
                <p className="text-xs text-gray-500 mt-1">{analytics.reviews_count} review{analytics.reviews_count !== 1 ? 's' : ''}</p>
              )}
            </div>
            <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-teal-500">
              <p className="text-gray-500 text-sm font-medium">Total Jobs</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.total_jobs ?? (inProgress.length + completed.length)}</p>
            </div>
          </div>
        </div>
      )}

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
