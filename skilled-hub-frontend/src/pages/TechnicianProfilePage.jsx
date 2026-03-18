import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { profilesAPI } from '../api/api';

const TechnicianProfilePage = ({ user, onLogout }) => {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id) {
      profilesAPI.getTechnicianById(id)
        .then(setProfile)
        .catch(() => setError('Failed to load technician profile'))
        .finally(() => setLoading(false));
    }
  }, [id]);

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
          <p className="text-lg text-red-600">{error || 'Technician not found'}</p>
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
                  {(profile.user?.email || 'T')[0].toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile.user?.email || 'Technician'}
                </h1>
            <div className="mt-2 flex flex-wrap gap-4 text-gray-600">
              <span className="flex items-center">
                <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                {profile.trade_type || 'General'}
              </span>
              <span className="flex items-center">
                <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                {profile.experience_years ?? 0} years experience
              </span>
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

          {profile.documents && profile.documents.filter((d) => d.doc_type === 'certificate').length > 0 && (
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Certificates</h2>
              <p className="text-sm text-gray-500 mb-4">Certificate images. Companies verify these match their job requirements.</p>
              <div className="flex flex-wrap gap-4">
                {profile.documents.filter((d) => d.doc_type === 'certificate').map((doc) => (
                  <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer" className="block w-40 h-40 border rounded-lg overflow-hidden bg-gray-50 hover:ring-2 hover:ring-blue-500 transition-shadow">
                    {doc.file_url && (
                      <img src={doc.file_url} alt="Certificate" className="w-full h-full object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Reviews</h2>
            {ratings.length === 0 ? (
              <p className="text-gray-500">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {ratings.map((r) => (
                  <div key={r.id} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">
                        {r.reviewer_type === 'CompanyProfile' ? 'Company' : 'Technician'} review
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

export default TechnicianProfilePage;
