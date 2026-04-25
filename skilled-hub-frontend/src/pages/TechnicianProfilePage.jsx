import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { profilesAPI, favoriteTechniciansAPI, adminUsersAPI } from '../api/api';
import ReferralModal from '../components/ReferralModal';
import AlertModal from '../components/AlertModal';

const TechnicianProfilePage = ({ user, onLogout }) => {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favBusy, setFavBusy] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const [mergeOptions, setMergeOptions] = useState([]);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [mergeDirection, setMergeDirection] = useState('into_selected');
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });

  useEffect(() => {
    if (id) {
      profilesAPI.getTechnicianById(id)
        .then(setProfile)
        .catch(() => setError('Failed to load technician profile'))
        .finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    if (user?.role === 'company') {
      favoriteTechniciansAPI
        .list()
        .then((res) => setFavoriteIds(res.technician_profile_ids || []))
        .catch(() => setFavoriteIds([]));
    }
  }, [user?.role, id]);

  useEffect(() => {
    if (user?.role !== 'admin') return undefined;
    const q = mergeQuery.trim();
    if (q.length < 2) {
      setMergeOptions([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setMergeBusy(true);
      try {
        const res = await adminUsersAPI.list({ q, role: 'technician' });
        const options = (res.users || [])
          .filter((u) => u.technician_profile_id != null && Number(u.technician_profile_id) !== Number(id));
        if (!cancelled) setMergeOptions(options);
      } catch {
        if (!cancelled) setMergeOptions([]);
      } finally {
        if (!cancelled) setMergeBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mergeQuery, id, user?.role]);

  const toggleFavorite = async () => {
    if (user?.role !== 'company' || !profile?.id) return;
    setFavBusy(true);
    try {
      const pid = Number(profile.id);
      if (favoriteIds.map(Number).includes(pid)) {
        await favoriteTechniciansAPI.remove(profile.id);
        setFavoriteIds((prev) => prev.filter((x) => Number(x) !== pid));
      } else {
        await favoriteTechniciansAPI.add(profile.id);
        setFavoriteIds((prev) => [...prev, profile.id]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFavBusy(false);
    }
  };

  const mergeTechnician = async () => {
    if (!mergeTarget?.technician_profile_id) {
      setAlertModal({
        isOpen: true,
        title: 'Target required',
        message: 'Select the technician profile to keep before merging.',
        variant: 'error',
      });
      return;
    }
    const keepCurrent = mergeDirection === 'into_current';
    const currentLabel = profile?.user?.email || `Technician #${id}`;
    const selectedLabel = mergeTarget.user_name || mergeTarget.email || `Technician #${mergeTarget.technician_profile_id}`;
    const confirmMessage = keepCurrent
      ? `Merge "${selectedLabel}" into "${currentLabel}"? This keeps the current account and removes the selected one. This cannot be undone.`
      : `Merge "${currentLabel}" into "${selectedLabel}"? This removes the current account and keeps the selected one. This cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;
    setMergeSaving(true);
    try {
      const directionParam = keepCurrent ? 'into_current' : 'into_target';
      await profilesAPI.mergeTechnicianProfile(id, mergeTarget.technician_profile_id, directionParam);
      window.location.assign(`/technicians/${keepCurrent ? id : mergeTarget.technician_profile_id}`);
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Merge failed',
        message: e.message || 'Could not merge technician profiles.',
        variant: 'error',
      });
    } finally {
      setMergeSaving(false);
    }
  };

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
      <AppHeader user={user} onLogout={onLogout} emailVariant="simple" />
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
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {profile.user?.email || 'Technician'}
                  </h1>
                  {user?.role === 'company' && (
                    <>
                      <button
                        type="button"
                        onClick={toggleFavorite}
                        disabled={favBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        title={favoriteIds.map(Number).includes(Number(profile.id)) ? 'Remove from favorites' : 'Save for repeat hire'}
                      >
                        {favoriteIds.map(Number).includes(Number(profile.id)) ? '★ Saved' : '☆ Save technician'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReferralModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                      >
                        Send Referral
                      </button>
                    </>
                  )}
                </div>
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

          {user?.role === 'admin' && (
            <div className="p-6 border-b border-gray-200 bg-amber-50/40">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Duplicate / Merge</h2>
              <p className="text-sm text-gray-600 mb-3">
                Choose merge direction: keep this current account, or keep the selected account.
              </p>
              <div className="mb-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="technician-merge-direction"
                    checked={mergeDirection === 'into_selected'}
                    onChange={() => setMergeDirection('into_selected')}
                  />
                  Merge current account into selected account (keep selected account data)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="technician-merge-direction"
                    checked={mergeDirection === 'into_current'}
                    onChange={() => setMergeDirection('into_current')}
                  />
                  Merge selected account into current account (keep current account data)
                </label>
              </div>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Search technician name/email..."
                value={mergeQuery}
                onChange={(e) => {
                  setMergeQuery(e.target.value);
                  setMergeTarget(null);
                }}
              />
              <div className="mt-2 border border-gray-200 rounded-lg bg-white max-h-44 overflow-auto">
                {mergeBusy ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
                ) : mergeOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No matches yet.</div>
                ) : (
                  mergeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMergeTarget(opt)}
                      className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${
                        Number(mergeTarget?.technician_profile_id) === Number(opt.technician_profile_id) ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.user_name || opt.email}</div>
                      <div className="text-xs text-gray-500">Tech profile #{opt.technician_profile_id}</div>
                    </button>
                  ))
                )}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={mergeSaving || !mergeTarget}
                  onClick={mergeTechnician}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {mergeSaving
                    ? 'Merging…'
                    : mergeDirection === 'into_current'
                      ? 'Merge selected into current technician'
                      : 'Merge current into selected technician'}
                </button>
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
      <ReferralModal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
        prefill={{
          first_name: '',
          last_name: '',
          referred_type: 'tech',
          email: profile?.user?.email || '',
          location: profile?.location || '',
        }}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((m) => ({ ...m, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
};

export default TechnicianProfilePage;
