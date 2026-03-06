import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { jobsAPI, profilesAPI, ratingsAPI } from '../api/api';
import { auth } from '../auth';

const JobList = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    location: '',
    status: '',
    keyword: ''
  });
  const [searchInput, setSearchInput] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [jobsPerPage] = useState(6);

  const [technicianProfile, setTechnicianProfile] = useState(null);
  const [claimingJobId, setClaimingJobId] = useState(null);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [reviewedJobIds, setReviewedJobIds] = useState(new Set());

  const user = auth.getUser();

  useEffect(() => {
    fetchJobs();
    if (auth.isTechnician()) {
      fetchTechnicianProfile();
    }
  }, [filters]);

  useEffect(() => {
    if (auth.isTechnician()) {
      setLoadingCompleted(true);
      jobsAPI.getTechnicianDashboard()
        .then(res => setCompletedJobs(res.completed || []))
        .catch(() => setCompletedJobs([]))
        .finally(() => setLoadingCompleted(false));
    }
  }, []);

  useEffect(() => {
    if (auth.isTechnician()) {
      ratingsAPI.getReviewedJobIds()
        .then((res) => setReviewedJobIds(new Set(res.job_ids || [])))
        .catch(() => setReviewedJobIds(new Set()));
    }
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const data = await jobsAPI.getAll(filters);
      // Sort jobs by created_at descending
      const sorted = [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setJobs(sorted);
      setError(null);
      setCurrentPage(1);
    } catch (err) {
      setError('Failed to load jobs');
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTechnicianProfile = async () => {
    try {
      const profile = await profilesAPI.getTechnicianProfile();
      setTechnicianProfile(profile);
    } catch {
      setTechnicianProfile(null);
    }
  };

  const handleClaimJob = async (jobId) => {
    try {
      setClaimingJobId(jobId);
      await jobsAPI.claim(jobId);
      await fetchJobs();
    } catch (err) {
      alert(err.message || 'Failed to claim job');
    } finally {
      setClaimingJobId(null);
    }
  };

  const isJobClaimedByMe = (job) => {
    if (!technicianProfile || !job.job_applications) return false;
    return job.job_applications.some(
      app => app.technician_profile_id === technicianProfile.id && app.status === 'accepted'
    );
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSearchInputChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, keyword: searchInput }));
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearFilters = () => {
    setFilters({
      location: '',
      status: '',
      keyword: ''
    });
    setSearchInput('');
  };

  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = jobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(jobs.length / jobsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push('...');
        pageNumbers.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pageNumbers.push(1);
        pageNumbers.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
        pageNumbers.push(1);
        pageNumbers.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push('...');
        pageNumbers.push(totalPages);
      }
    }

    return pageNumbers;
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'open': { label: 'Open', className: 'bg-green-100 text-green-800' },
      'closed': { label: 'Closed', className: 'bg-red-100 text-red-800' },
      'reserved': { label: 'Reserved', className: 'bg-yellow-100 text-yellow-800' }
    };

    const statusInfo = statusMap[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}>
        {statusInfo.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading jobs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12">
      {auth.isTechnician() && (
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Completed Jobs</h2>
          <p className="text-gray-600 mb-4">Jobs you've completed. Leave a review for the company.</p>
          {loadingCompleted ? (
            <div className="text-gray-500 py-4">Loading completed jobs...</div>
          ) : completedJobs.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-gray-600">
              No completed jobs yet. Complete a job and the company will mark it as finished.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {completedJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white border-2 border-gray-200 rounded-xl shadow p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      Complete
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm line-clamp-2 mb-2">{job.description || '—'}</p>
                  <div className="text-xs text-gray-500 mb-4">
                    <Link
                      to={`/companies/${job.company_profile_id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {job.company_profile?.company_name || 'Company'}
                    </Link>
                    {' • '}{job.location}
                  </div>
                  <div className="flex flex-col gap-2 mt-auto">
                    <Link
                      to={`/companies/${job.company_profile_id}`}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-center text-sm font-medium border border-gray-200"
                    >
                      View Company Profile
                    </Link>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center text-sm font-medium"
                    >
                      {reviewedJobIds.has(job.id) ? 'View Past Job' : 'View & Leave Review'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-10">Available Jobs</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <input
            type="text"
            name="keyword"
            placeholder="Search jobs..."
            value={searchInput}
            onChange={handleSearchInputChange}
            onKeyDown={handleSearchKeyDown}
            className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            name="location"
            value={filters.location}
            onChange={handleFilterChange}
            className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Locations</option>
            <option value="Austin, TX">Austin, TX</option>
            <option value="Dallas, TX">Dallas, TX</option>
            <option value="Houston, TX">Houston, TX</option>
          </select>
          <select
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
            className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="reserved">Reserved</option>
          </select>
          <div className="flex space-x-2">
            <button
              onClick={handleSearch}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors border-2 border-blue-600"
            >
              Search
            </button>
            <button
              onClick={clearFilters}
              className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors border-2 border-gray-500"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg">No jobs found matching your criteria.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {currentJobs.filter(job => job && job.title).map((job, idx, arr) => (
              <div 
                key={job.id} 
                className={`h-full bg-white border-2 border-gray-300 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 flex flex-col${idx !== arr.length - 1 ? ' mb-8' : ''}`}
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                      {job.title}
                    </h3>
                    {getStatusBadge(job.status)}
                  </div>
                  
                  <p className="text-gray-600 line-clamp-3 text-sm">
                    {job.description.length > 80 
                      ? `${job.description.substring(0, 80)}...` 
                      : job.description
                    }
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center text-xs text-gray-500">
                      <svg 
                        className="mr-2" 
                        fill="currentColor" 
                        viewBox="0 0 20 20"
                        style={{ width: '10px', height: '10px' }}
                      >
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                      {job.location}
                    </div>
                    <div className="text-xs text-gray-500">
                      <Link
                        to={`/companies/${job.company_profile_id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {job.company_profile?.company_name || 'Company'}
                      </Link>
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2 pt-2">
                    <Link 
                      to={`/jobs/${job.id}`}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center border-2 border-blue-600 text-sm"
                    >
                      View Details
                    </Link>
                    {auth.isTechnician() && (
                      <Link
                        to={`/companies/${job.company_profile_id}`}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-center border-2 border-gray-200 text-sm font-medium"
                      >
                        View Company Profile
                      </Link>
                    )}
                    {auth.isTechnician() && job.status === 'open' && (
                      <button
                        onClick={(e) => { e.preventDefault(); handleClaimJob(job.id); }}
                        disabled={claimingJobId === job.id}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors border-2 border-green-600 text-sm disabled:opacity-50"
                      >
                        {claimingJobId === job.id ? 'Claiming...' : 'Claim Job'}
                      </button>
                    )}
                    {auth.isTechnician() && job.status === 'reserved' && isJobClaimedByMe(job) && (
                      <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-center text-sm font-medium">
                        Claimed by you
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-16 flex items-center justify-center">
              <nav className="flex items-center space-x-4">
                <button
                  onClick={() => paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-3 text-sm font-medium text-gray-500 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                {getPageNumbers().map((number, index) => (
                  <button
                    key={index}
                    onClick={() => typeof number === 'number' ? paginate(number) : null}
                    disabled={number === '...'}
                    className={`px-4 py-3 text-sm font-medium rounded-lg border-2 ${
                      number === currentPage
                        ? 'bg-blue-600 text-white border-blue-600'
                        : number === '...'
                        ? 'text-gray-400 cursor-default border-transparent'
                        : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {number}
                  </button>
                ))}

                <button
                  onClick={() => paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-3 text-sm font-medium text-gray-500 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 text-center text-sm text-gray-600">
              Showing {indexOfFirstJob + 1} to {Math.min(indexOfLastJob, jobs.length)} of {jobs.length} jobs
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default JobList;
