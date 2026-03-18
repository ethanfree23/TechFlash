import React, { useEffect, useState } from 'react';
import apiRequest from '../api/api';
import { FaBriefcase, FaUser, FaCalendarAlt, FaCheckSquare } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

// open, claimed (filled but not started), active (in progress), completed
const statusLabel = (job) => {
  if (!job) return null;
  const status = job.status;
  if (status === 'open') return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Open</span>;
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

const summaryCards = [
  { label: 'Active Jobs', value: 3, icon: <FaBriefcase className="text-2xl text-blue-600" /> },
  { label: 'Applicants', value: 42, icon: <FaUser className="text-2xl text-blue-600" /> },
  { label: 'Interviews Scheduled', value: 5, icon: <FaCalendarAlt className="text-2xl text-blue-600" /> },
  { label: 'Jobs Filled', value: 12, icon: <FaCheckSquare className="text-2xl text-blue-600" /> },
];

const mockActivity = [
  { text: 'New applicant, John Doe applied for Electrical Technician', time: '2 hours ago' },
  { text: 'Interview scheduled with Maria Gomez', time: 'Yesterday' },
  { text: 'Job posted: Welder - Houston', time: '2 days ago' },
];

const mockJobs = [
  { title: 'Electrician Needed', applicants: 5, status: 'Open', created: '2 days ago' },
  { title: 'HVAC Installer', applicants: 12, status: 'Interviewing', created: '1 week ago' },
  { title: 'Forklift Operator', applicants: 0, status: 'Draft', created: 'Just now' },
];

const CompanyDashboard = ({ user, onLogout }) => {
  const [jobs, setJobs] = useState({ requested: [], unrequested: [], expired: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchDashboardJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/dashboard/jobs');
      setJobs(res);
    } catch (err) {
      setError('Failed to load dashboard jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardJobs();
  }, []);

  const handleFinish = async (jobId) => {
    try {
      await apiRequest(`/jobs/${jobId}/finish`, { method: 'PATCH' });
      fetchDashboardJobs();
    } catch (err) {
      alert('Failed to mark job as finished');
    }
  };

  // Combine all jobs for the table (or you can separate by section if you want)
  const allJobs = [
    ...(jobs.requested || []),
    ...(jobs.unrequested || []),
    ...(jobs.expired || [])
  ];

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg text-gray-600">Loading dashboard...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-8 text-center text-red-600">{error}</div>
    </div>
  );

  // Example summary data (replace with real data if available)
  const jobsCreated = jobs.requested.length + jobs.unrequested.length + jobs.expired.length;
  const pendingTasks = jobs.requested.length; // Example: requested jobs as pending
  const completed = jobs.expired.length; // Example: expired jobs as completed

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <img src="/techflash-logo.png" alt="TechFlash" className="h-9 object-contain" />
          </div>
          <div className="flex items-center space-x-4">
            <button className="relative focus:outline-none">
              <span className="sr-only">Notifications</span>
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            </button>
            <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 font-bold">
              {user?.email?.[0]?.toUpperCase() || 'C'}
            </div>
            <button 
              onClick={onLogout} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {summaryCards.map((card, idx) => (
              <div key={idx} className="bg-white rounded-2xl shadow flex items-center p-6 space-x-4">
                <div>{card.icon}</div>
                <div>
                  <div className="text-gray-500 text-sm font-medium">{card.label}</div>
                  <div className="text-2xl font-bold text-gray-800">{card.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Recent Activity Timeline */}
            <div className="bg-white rounded-2xl shadow p-6 col-span-1">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h2>
              <ol className="relative border-l border-gray-200 ml-2">
                {mockActivity.map((item, idx) => (
                  <li key={idx} className="mb-8 ml-4">
                    <div className="absolute w-3 h-3 bg-blue-200 rounded-full mt-1.5 -left-1.5 border border-white"></div>
                    <p className="text-gray-700">{item.text}</p>
                    <span className="text-xs text-gray-500">{item.time}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Active Jobs Table */}
            <div className="bg-white rounded-2xl shadow p-6 col-span-2">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Active Jobs</h2>
                <button className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg shadow" onClick={() => navigate('/jobs/create')}>
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
                  <tbody className="bg-white divide-y divide-gray-100">
                    {allJobs.map((job) => (
                      <tr key={job.id}>
                        <td className="px-4 py-2 font-medium text-gray-800">{job.title}</td>
                        <td className="px-4 py-2">
                          {statusLabel(job)}
                        </td>
                        <td className="px-4 py-2">{new Date(job.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-2 flex space-x-2">
                          <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded" onClick={() => navigate(`/jobs/${job.id}/edit`)}>Edit</button>
                          <button className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded" onClick={() => navigate(`/jobs/${job.id}`)}>View</button>
                          {(job.status === 'reserved' || job.status === 'filled') && (
                            <button className="bg-green-200 hover:bg-green-300 text-green-800 px-3 py-1 rounded" onClick={() => handleFinish(job.id)}>Mark Complete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CompanyDashboard; 