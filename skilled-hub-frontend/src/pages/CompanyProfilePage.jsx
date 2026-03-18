import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { profilesAPI } from '../api/api';

const CompanyProfilePage = ({ user, onLogout }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    profilesAPI.getCompanyById(id)
      .then(setProfile)
      .catch((err) => {
        // Backend returns 403 when company tries to view another company's profile
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('own company') || msg.includes('forbidden') || msg.includes('403')) {
          navigate('/dashboard', { replace: true });
        } else {
          setError('Failed to load company profile');
        }
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-600">{error || 'Company not found'}</p>
          <Link to="/jobs" className="mt-4 inline-block text-blue-600 hover:underline">Back to Jobs</Link>
        </div>
      </div>
    );
  }

  const ratings = profile.ratings_received || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center gap-6">
            <Link to="/dashboard"><img src="/techflash-logo.png" alt="TechFlash" className="h-9 object-contain" /></Link>
            <nav className="flex items-center gap-4">
              <Link to="/dashboard" className="px-3 py-2 font-medium text-gray-700 hover:text-blue-600">Dashboard</Link>
              <Link to="/jobs" className="px-3 py-2 font-medium text-gray-700 hover:text-blue-600">Jobs</Link>
              <Link to="/settings" className="px-3 py-2 font-medium text-gray-700 hover:text-blue-600">Profile & Settings</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button onClick={onLogout} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Logout</button>
          </div>
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link to="/dashboard" className="text-blue-600 hover:text-blue-800 text-sm">Dashboard</Link>
          <span className="text-gray-400 mx-2">|</span>
          <Link to="/jobs" className="text-blue-600 hover:text-blue-800 text-sm">Jobs</Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-start gap-6">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-300 flex items-center justify-center text-2xl font-bold text-gray-500 shrink-0">
                  {(profile.company_name || 'C')[0].toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile.company_name || 'Company'}
                </h1>
                <div className="mt-2 flex flex-wrap gap-4 text-gray-600">
              {profile.industry && (
                <span className="flex items-center">
                  <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                  {profile.industry}
                </span>
              )}
              {profile.location && (
                <span className="flex items-center">
                  <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  {profile.location}
                </span>
              )}
              {profile.average_rating != null && (
                <span className="inline-flex items-center text-amber-600 font-medium">
                  ★ {Number(profile.average_rating).toFixed(1)} average rating
                </span>
              )}
                </div>
              </div>
            </div>
          </div>

          {profile.bio && (
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">About</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}

          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Reviews from Technicians</h2>
            {ratings.length === 0 ? (
              <p className="text-gray-500">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {ratings.map((r) => (
                  <div key={r.id} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <span className="text-sm text-gray-500">
                        Technician review
                        {r.job_id && (
                          <Link to={`/jobs/${r.job_id}`} className="ml-2 text-blue-600 hover:underline">
                            (Job #{r.job_id})
                          </Link>
                        )}
                      </span>
                      <span className="inline-flex items-center text-amber-600 font-medium">
                        ★ {r.score != null ? Number(r.score).toFixed(1) : '—'} overall
                      </span>
                    </div>
                    {r.category_scores && Object.keys(r.category_scores || {}).length > 0 && r.category_labels && (
                      <div className="space-y-1 mb-2 text-sm">
                        {Object.entries(r.category_scores).map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className="text-gray-600">{r.category_labels[k] || k}</span>
                            <span className="text-amber-600 font-medium">{v}/5 ★</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.comment && <p className="text-gray-700 text-sm mt-2">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyProfilePage;
