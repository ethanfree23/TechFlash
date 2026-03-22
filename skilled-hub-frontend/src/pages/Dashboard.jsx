import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobsAPI, ratingsAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import { FaBriefcase, FaCheckSquare, FaWrench, FaFolderOpen, FaDollarSign, FaStar, FaChartLine, FaUsers, FaUserCog, FaBuilding } from 'react-icons/fa';

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

const Dashboard = ({ user, onLogout }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [analytics, setAnalytics] = useState(null);
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
        const [jobsRes, analyticsRes] = await Promise.all([
          jobsAPI.getDashboard(),
          jobsAPI.getAnalytics().catch(() => null),
        ]);
        setJobs(jobsRes);
        setAnalytics(analyticsRes);
      } else if (user?.role === 'technician') {
        const [jobsRes, analyticsRes] = await Promise.all([
          jobsAPI.getTechnicianDashboard(),
          jobsAPI.getAnalytics().catch(() => null),
        ]);
        setJobs(jobsRes);
        setAnalytics(analyticsRes);
      } else if (user?.role === 'admin') {
        const analyticsRes = await jobsAPI.getAnalytics().catch(() => null);
        setJobs(null);
        setAnalytics(analyticsRes);
      } else {
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
        <DashboardHeader user={user} onLogout={onLogout} />
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
        <DashboardHeader user={user} onLogout={onLogout} />
        <div className="p-8 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader user={user} onLogout={onLogout} />
      <main className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {user?.role === 'company' && (
            <CompanyDashboardContent jobs={jobs} analytics={analytics} onFinish={handleFinish} onRefresh={fetchDashboard} navigate={navigate} user={user} />
          )}
          {user?.role === 'technician' && (
            <TechnicianDashboardContent jobs={jobs} analytics={analytics} navigate={navigate} user={user} />
          )}
          {user?.role === 'admin' && (
            <AdminDashboardContent analytics={analytics} navigate={navigate} user={user} />
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

const DashboardHeader = ({ user, onLogout }) => (
  <header className="bg-white shadow-sm border-b border-gray-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
      <div className="flex items-center space-x-6">
        <Link to="/dashboard" className="flex items-center space-x-2">
          <img src="/techflash-logo.png" alt="TechFlash" className="h-9 object-contain" />
        </Link>
        <nav className="flex space-x-4">
          <Link to="/dashboard" className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">Dashboard</Link>
          <Link to="/jobs" className="text-gray-600 hover:text-blue-600">Jobs</Link>
          <Link to="/messages" className="text-gray-600 hover:text-blue-600">Messages</Link>
          <Link to="/settings" className="text-gray-600 hover:text-blue-600">Settings</Link>
        </nav>
      </div>
      <div className="flex items-center space-x-4">
        <Link to="/settings" className="flex items-center gap-2 hover:opacity-80" title="Settings">
          <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 font-bold">
            {user?.email?.[0]?.toUpperCase() || '?'}
          </div>
        </Link>
        <span className="text-xs text-gray-500 capitalize">{user?.role}</span>
        <button
          onClick={onLogout}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Logout
        </button>
      </div>
    </div>
  </header>
);

const AdminDashboardContent = ({ analytics, navigate, user }) => (
  <>
    <h2 className="text-xl font-semibold text-gray-800 mb-6">Platform Overview</h2>
    {analytics && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm font-medium">Total Users</p>
              <p className="text-2xl font-bold mt-1">{analytics.total_users ?? 0}</p>
            </div>
            <FaUsers className="text-3xl text-indigo-200/80" />
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-blue-500">
          <div className="flex items-center gap-2">
            <FaUserCog className="text-blue-500" />
            <div>
              <p className="text-gray-500 text-sm font-medium">Technicians</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.technicians_count ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-amber-500">
          <div className="flex items-center gap-2">
            <FaBuilding className="text-amber-500" />
            <div>
              <p className="text-gray-500 text-sm font-medium">Companies</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.companies_count ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-teal-500">
          <p className="text-gray-500 text-sm font-medium">Total Jobs</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.total_jobs ?? 0}</p>
        </div>
        <div className="bg-white rounded-2xl shadow flex flex-col justify-center p-5 border-l-4 border-emerald-500">
          <p className="text-gray-500 text-sm font-medium">Job Applications</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.total_job_applications ?? 0}</p>
        </div>
      </div>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <div className="bg-white rounded-2xl shadow p-5 border-l-4 border-blue-400">
        <p className="text-gray-500 text-sm font-medium">Open Jobs</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{analytics?.jobs_open ?? 0}</p>
      </div>
      <div className="bg-white rounded-2xl shadow p-5 border-l-4 border-yellow-400">
        <p className="text-gray-500 text-sm font-medium">In Progress</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{analytics?.jobs_in_progress ?? 0}</p>
      </div>
      <div className="bg-white rounded-2xl shadow p-5 border-l-4 border-green-400">
        <p className="text-gray-500 text-sm font-medium">Completed</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{analytics?.jobs_finished ?? 0}</p>
      </div>
    </div>
    <div className="mt-8">
      <Link
        to="/jobs"
        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
      >
        <FaBriefcase /> View All Jobs
      </Link>
    </div>
  </>
);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
