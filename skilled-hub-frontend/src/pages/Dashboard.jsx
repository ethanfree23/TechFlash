import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobsAPI, ratingsAPI } from '../api/api';
import { FaBriefcase, FaCheckSquare, FaWrench } from 'react-icons/fa';

const statusLabel = (status) => {
  const map = {
    open: { label: 'Open', className: 'bg-blue-100 text-blue-800' },
    reserved: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-800' },
    filled: { label: 'Filled', className: 'bg-yellow-200 text-yellow-800' },
    finished: { label: 'Complete', className: 'bg-green-200 text-green-800' },
  };
  const s = map[status];
  return s ? <span className={`px-2 py-1 text-xs rounded ${s.className}`}>{s.label}</span> : <span className="capitalize text-gray-600">{status}</span>;
};

const Dashboard = ({ user, onLogout }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
  }, [user?.role]);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      if (user?.role === 'company') {
        const res = await jobsAPI.getDashboard();
        setJobs(res);
      } else if (user?.role === 'technician') {
        const res = await jobsAPI.getTechnicianDashboard();
        setJobs(res);
      } else {
        setJobs(null);
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
    } catch (err) {
      alert('Failed to mark job as finished');
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
            <CompanyDashboardContent jobs={jobs} onFinish={handleFinish} onRefresh={fetchDashboard} navigate={navigate} />
          )}
          {user?.role === 'technician' && (
            <TechnicianDashboardContent jobs={jobs} navigate={navigate} user={user} />
          )}
          {user?.role !== 'company' && user?.role !== 'technician' && (
            <p className="text-gray-500">Dashboard not available for your role.</p>
          )}
        </div>
      </main>
    </div>
  );
};

const DashboardHeader = ({ user, onLogout }) => (
  <header className="bg-white shadow-sm border-b border-gray-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
      <div className="flex items-center space-x-6">
        <Link to="/dashboard" className="flex items-center space-x-2">
          <span className="bg-blue-100 p-2 rounded-full"><FaBriefcase className="text-blue-600 text-xl" /></span>
          <span className="text-2xl font-bold text-blue-600">SkilledHub</span>
        </Link>
        <nav className="flex space-x-4">
          <Link to="/dashboard" className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">Dashboard</Link>
          <Link to="/jobs" className="text-gray-600 hover:text-blue-600">Jobs</Link>
        </nav>
      </div>
      <div className="flex items-center space-x-4">
        <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 font-bold">
          {user?.email?.[0]?.toUpperCase() || '?'}
        </div>
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

const CompanyDashboardContent = ({ jobs, onFinish, onRefresh, navigate }) => {
  const allJobs = [
    ...(jobs?.requested || []),
    ...(jobs?.unrequested || []),
    ...(jobs?.expired || []),
  ];
  const completedCount = (jobs?.expired || []).length;
  const activeCount = (jobs?.requested || []).length + (jobs?.unrequested || []).length;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4">
          <FaBriefcase className="text-2xl text-blue-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Total Jobs</div>
            <div className="text-2xl font-bold text-gray-800">{allJobs.length}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4">
          <FaWrench className="text-2xl text-yellow-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Active</div>
            <div className="text-2xl font-bold text-gray-800">{activeCount}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4">
          <FaCheckSquare className="text-2xl text-green-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Completed</div>
            <div className="text-2xl font-bold text-gray-800">{completedCount}</div>
          </div>
        </div>
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
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No jobs yet. <Link to="/jobs/create" className="text-blue-600 hover:underline">Create your first job</Link>
                  </td>
                </tr>
              ) : (
                allJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-2 font-medium text-gray-800">{job.title}</td>
                    <td className="px-4 py-2">{statusLabel(job.status)}</td>
                    <td className="px-4 py-2">{new Date(job.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2 flex space-x-2">
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm" onClick={() => navigate(`/jobs/${job.id}/edit`)}>Edit</button>
                      <button className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm" onClick={() => navigate(`/jobs/${job.id}`)}>View</button>
                      {job.status === 'reserved' && (
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

const TechnicianDashboardContent = ({ jobs, navigate, user }) => {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4">
          <FaWrench className="text-2xl text-yellow-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">In Progress</div>
            <div className="text-2xl font-bold text-gray-800">{inProgress.length}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4">
          <FaCheckSquare className="text-2xl text-green-600" />
          <div>
            <div className="text-gray-500 text-sm font-medium">Completed</div>
            <div className="text-2xl font-bold text-gray-800">{completed.length}</div>
          </div>
        </div>
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
