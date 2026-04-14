import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobsAPI, ratingsAPI, feedbackAPI, adminAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import AppHeader from '../components/AppHeader';
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

const humanizeStatus = (s) => (s == null ? '—' : String(s).replace(/_/g, ' '));

const AdminInsightTable = ({ category, items }) => {
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
            {items.map((row) => (
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
            {items.map((row) => (
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
            {items.map((row) => (
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [feedbackList, setFeedbackList] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
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
        const [jobsRes, analyticsRes] = await Promise.all([
          jobsAPI.getTechnicianDashboard(),
          jobsAPI.getAnalytics().catch(() => null),
        ]);
        setJobs(jobsRes);
        setAnalytics(analyticsRes);
      } else if (user?.role === 'admin') {
        const [analyticsRes, feedbackRes] = await Promise.all([
          jobsAPI.getAnalytics().catch(() => null),
          feedbackAPI.list().catch(() => null),
        ]);
        setJobs(null);
        setAnalytics(analyticsRes);
          setFeedbackList(feedbackRes?.feedback_submissions ?? []);
      } else {
        setFeedbackList(null);
        setJobs(null);
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
            <CompanyDashboardContent jobs={jobs} analytics={analytics} onFinish={handleFinish} onRefresh={fetchDashboard} navigate={navigate} user={user} />
          )}
          {user?.role === 'technician' && (
            <TechnicianDashboardContent jobs={jobs} analytics={analytics} navigate={navigate} user={user} />
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

const CompanyDashboardContent = ({ jobs, analytics, onFinish, onRefresh, navigate, user }) => {
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

const TechnicianDashboardContent = ({ jobs, analytics, navigate, user }) => {
  const inProgress = jobs?.in_progress || [];
  const completed = jobs?.completed || [];
  const [reviewedJobIds, setReviewedJobIds] = useState(new Set());

  useEffect(() => {
    if (user?.role === 'technician') {
      ratingsAPI.getReviewedJobIds()
        .then((res) => setReviewedJobIds(new Set(res.job_ids || [])))
        .catch(() => setReviewedJobIds(new Set()));
    }
  }, [user?.role]);

  return (
    <>
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
