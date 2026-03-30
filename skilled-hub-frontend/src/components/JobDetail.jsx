import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { jobsAPI, profilesAPI, ratingsAPI, conversationsAPI } from '../api/api';
import MessageModal from './MessageModal';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import { auth } from '../auth';
import { EXPERIENCE_YEAR_OPTIONS, formatExperienceLong } from '../constants/experienceSelect';
import Modal from 'react-modal';
import StarRating from './StarRating';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [user, setUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showClaimedModal, setShowClaimedModal] = useState(false);
  const [editData, setEditData] = useState({
    description: '',
    skill_class: '',
    minimum_years_experience: '',
    notes: '',
    required_certifications: [''],
    location: '',
    hourly_rate_cents: '',
    hours_per_day: '8',
    days: '',
    scheduled_start_at: '',
    scheduled_end_at: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [claimedBy, setClaimedBy] = useState(null);
  const [loadingClaimed, setLoadingClaimed] = useState(false);
  const [claimedTechnicianData, setClaimedTechnicianData] = useState(null);
  const [technicianProfileId, setTechnicianProfileId] = useState(null);
  const [companyProfileId, setCompanyProfileId] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [otherPartyHasReviewed, setOtherPartyHasReviewed] = useState(false);
  const [currentUserHasReviewed, setCurrentUserHasReviewed] = useState(false);
  const [reviewedJobIds, setReviewedJobIds] = useState(new Set());
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewCategories, setReviewCategories] = useState({});
  const [reviewData, setReviewData] = useState({ category_scores: {}, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [denying, setDenying] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageConversationId, setMessageConversationId] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });
  const [showDenyConfirm, setShowDenyConfirm] = useState(false);

  useEffect(() => {
    // Read user from localStorage on mount
    const storedUser = localStorage.getItem('user');
    if (storedUser && storedUser !== 'undefined') {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchJobDetails();
    }
  }, [id]);

  useEffect(() => {
    if (user?.role === 'technician') {
      profilesAPI.getTechnicianProfile()
        .then(p => setTechnicianProfileId(p?.id))
        .catch(() => setTechnicianProfileId(null));
    } else {
      setTechnicianProfileId(null);
    }
    if (user?.role === 'company') {
      profilesAPI.getCompanyProfile()
        .then(p => setCompanyProfileId(p?.id))
        .catch(() => setCompanyProfileId(null));
    } else {
      setCompanyProfileId(null);
    }
  }, [user]);

  useEffect(() => {
    const jobComplete = job?.status === 'finished' || job?.status === 'filled';
    if (jobComplete && auth.isAuthenticated()) {
      ratingsAPI.getReviewedJobIds()
        .then((res) => setReviewedJobIds(new Set((res.job_ids || []).map(Number))))
        .catch(() => setReviewedJobIds(new Set()));
    } else {
      setReviewedJobIds(new Set());
    }
  }, [job?.status, id]);

  useEffect(() => {
    const jobComplete = job?.status === 'finished' || job?.status === 'filled';
    if (jobComplete && id) {
      ratingsAPI.getByJob(id)
        .then((res) => {
          if (Array.isArray(res)) {
            setRatings(res);
            setOtherPartyHasReviewed(false);
            setCurrentUserHasReviewed(false);
          } else {
            setRatings(res.ratings || []);
            setOtherPartyHasReviewed(res.other_party_has_reviewed ?? false);
            setCurrentUserHasReviewed(res.current_user_has_reviewed ?? false);
          }
        })
        .catch(() => {
          setRatings([]);
          setOtherPartyHasReviewed(false);
          setCurrentUserHasReviewed(false);
        });
    } else {
      setRatings([]);
      setOtherPartyHasReviewed(false);
    }
  }, [job?.status, id]);

  useEffect(() => {
    const complete = job?.status === 'finished' || job?.status === 'filled';
    if (showReviewForm && user && complete) {
      const as = user.role === 'technician' ? 'technician' : 'company';
      ratingsAPI.getReviewCategories(as)
        .then(res => {
          const cats = res.categories || {};
          setReviewCategories(cats);
          setReviewData(prev => ({
            ...prev,
            category_scores: Object.keys(cats).reduce((acc, k) => ({ ...acc, [k]: 5 }), {}),
          }));
        })
        .catch(() => setReviewCategories({}));
    }
  }, [showReviewForm, user, job?.status]);

  useEffect(() => {
    const accepted = job?.job_applications?.find(app => app.status === 'accepted' || app.status === 1);
    const techFromJob = accepted?.technician_profile;
    const techId = accepted?.technician_profile_id ?? techFromJob?.id;
    if (techFromJob?.user != null) {
      setClaimedTechnicianData(techFromJob);
    } else if (techId && (job?.status === 'reserved' || job?.status === 'finished' || job?.status === 'filled')) {
      profilesAPI.getTechnicianById(techId)
        .then((t) => setClaimedTechnicianData(t))
        .catch(() => setClaimedTechnicianData(null));
    } else {
      setClaimedTechnicianData(null);
    }
  }, [job?.job_applications, job?.status]);

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const data = await jobsAPI.getById(id);
      setJob(data);
      setError(null);
    } catch (err) {
      setError('Failed to load job details');
      console.error('Error fetching job details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimJob = async () => {
    if (!user || user.role !== 'technician') return;
    try {
      setClaiming(true);
      await jobsAPI.claim(id);
      await fetchJobDetails();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to claim job', message: err.message || 'Failed to claim job', variant: 'error' });
    } finally {
      setClaiming(false);
    }
  };

  const isJobClaimedByMe = () => {
    if (!technicianProfileId || !job?.job_applications) return false;
    return job.job_applications.some(
      app => String(app.technician_profile_id) === String(technicianProfileId) && (app.status === 'accepted' || app.status === 1)
    );
  };

  const handleBackToList = () => {
    navigate('/jobs');
  };

  const getStatusBadge = (job) => {
    const status = job?.status;
    if (status === 'open') return <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">Open</span>;
    if (status === 'finished') return <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-200 text-green-800">Completed</span>;
    if (status === 'reserved' || status === 'filled') {
      const startAt = job?.scheduled_start_at ? new Date(job.scheduled_start_at).getTime() : null;
      const now = Date.now();
      if (startAt === null || startAt > now) {
        return <span className="px-3 py-1 text-sm font-medium rounded-full bg-yellow-100 text-yellow-800">Claimed</span>;
      }
      return <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">Active</span>;
    }
    return <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-800">{status || '—'}</span>;
  };

  const openEditModal = () => {
    const hasNewPricing = job.hourly_rate_cents != null && job.days != null;
    setEditData({
      description: job.description || '',
      skill_class: job.skill_class || '',
      minimum_years_experience: job.minimum_years_experience != null ? String(job.minimum_years_experience) : '',
      notes: job.notes || '',
      required_certifications: (() => {
        const raw = job.required_certifications?.trim();
        const arr = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
        return arr.length ? arr : [''];
      })(),
      location: job.location || '',
      hourly_rate_cents: hasNewPricing ? (job.hourly_rate_cents / 100).toFixed(2) : '',
      hours_per_day: String(job.hours_per_day ?? 8),
      days: job.days != null ? String(job.days) : '',
      scheduled_start_at: toDatetimeLocal(job.scheduled_start_at),
      scheduled_end_at: toDatetimeLocal(job.scheduled_end_at),
    });
    setShowEditModal(true);
  };
  const closeEditModal = () => setShowEditModal(false);

  const openClaimedModal = async () => {
    setShowClaimedModal(true);
    setLoadingClaimed(true);
    try {
      const apps = job?.job_applications || [];
      const accepted = apps.find(app => app.status === 'accepted' || app.status === 1);
      let tech = accepted?.technician_profile || null;
      if (!tech && accepted?.technician_profile_id) {
        try {
          tech = await profilesAPI.getTechnicianById(accepted.technician_profile_id);
        } catch {
          tech = null;
        }
      }
      setClaimedBy(tech);
    } catch {
      setClaimedBy(null);
    } finally {
      setLoadingClaimed(false);
    }
  };
  const closeClaimedModal = () => setShowClaimedModal(false);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditCertChange = (idx, value) => {
    setEditData(prev => {
      const next = [...(prev.required_certifications || [''])];
      next[idx] = value;
      return { ...prev, required_certifications: next };
    });
  };

  const handleEditCertRemove = (idx) => {
    setEditData(prev => ({
      ...prev,
      required_certifications: (prev.required_certifications || ['']).filter((_, i) => i !== idx),
    }));
  };

  const handleEditCertAdd = () => {
    setEditData(prev => ({
      ...prev,
      required_certifications: [...(prev.required_certifications || ['']), ''],
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const hr = parseFloat(editData.hourly_rate_cents) || 0;
      const hpd = parseInt(editData.hours_per_day, 10) || 8;
      const d = parseInt(editData.days, 10) || 0;
      const jobAmount = hr * hpd * d;

      const years = (editData.minimum_years_experience || '').toString().trim() === ''
        ? null
        : parseInt(editData.minimum_years_experience, 10);
      const payload = {
        description: editData.description,
        skill_class: (editData.skill_class || '').trim() || null,
        minimum_years_experience: years != null && !Number.isNaN(years) ? years : null,
        notes: (editData.notes || '').trim() || null,
        required_certifications: Array.isArray(editData.required_certifications) && editData.required_certifications.filter((c) => c?.trim()).length
          ? editData.required_certifications.filter((c) => c?.trim()).join(", ")
          : null,
        location: editData.location,
        scheduled_start_at: editData.scheduled_start_at ? new Date(editData.scheduled_start_at).toISOString() : null,
        scheduled_end_at: editData.scheduled_end_at ? new Date(editData.scheduled_end_at).toISOString() : null,
      };
      if (jobAmount > 0) {
        payload.hourly_rate_cents = Math.round(hr * 100);
        payload.hours_per_day = hpd;
        payload.days = d;
      } else {
        payload.hourly_rate_cents = null;
        payload.hours_per_day = null;
        payload.days = null;
      }
      await jobsAPI.update(job.id, payload);
      await fetchJobDetails();
      closeEditModal();
    } catch {
      setAlertModal({ isOpen: true, title: 'Unable to update job', message: 'Failed to update job', variant: 'error' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDenyTechnician = () => {
    setShowDenyConfirm(true);
  };

  const confirmDenyTechnician = async () => {
    setShowDenyConfirm(false);
    setDenying(true);
    try {
      await jobsAPI.deny(job.id);
      await fetchJobDetails();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to deny', message: err.message || 'Failed to deny', variant: 'error' });
    } finally {
      setDenying(false);
    }
  };

  const handleMessageCompany = async () => {
    if (!user || !id) return;
    try {
      const techId = user.role === 'company' ? (acceptedApp?.technician_profile_id ?? claimedTechnician?.id) : null;
      const conv = await conversationsAPI.createForJob(id, techId);
      setMessageConversationId(conv.id);
      setShowMessageModal(true);
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to start conversation', message: err.message || 'Failed to start conversation', variant: 'error' });
    }
  };

  const handleMarkComplete = async () => {
    setMarkingComplete(true);
    try {
      await jobsAPI.finish(job.id);
      await fetchJobDetails();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to complete', message: err.message || 'Failed to mark complete', variant: 'error' });
    } finally {
      setMarkingComplete(false);
    }
  };

  const canLeaveReview = () => {
    if (!user || !job) return false;
    const jobComplete = job.status === 'finished' || job.status === 'filled';
    if (!jobComplete) return false;
    if (user.role === 'company' && job.company_profile_id === companyProfileId) return true;
    if (user.role === 'technician') return true; // Technician dashboard only shows their completed jobs
    return false;
  };

  const hasAlreadyReviewed = () => {
    if (currentUserHasReviewed) return true;
    const jobIdNum = parseInt(id, 10);
    if (!isNaN(jobIdNum) && reviewedJobIds.has(jobIdNum)) return true;
    if (!ratings.length) return false;
    const reviewerType = user?.role === 'company' ? 'CompanyProfile' : 'TechnicianProfile';
    const reviewerId = user?.role === 'company' ? companyProfileId : technicianProfileId;
    return ratings.some(r =>
      r.reviewer_type === reviewerType &&
      String(r.reviewer_id) === String(reviewerId)
    );
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    const { category_scores } = reviewData;
    const keys = Object.keys(reviewCategories);
    if (!keys.length || !keys.every(k => category_scores[k] >= 1 && category_scores[k] <= 5)) {
      setAlertModal({ isOpen: true, title: 'Complete your rating', message: 'Please rate all categories (1-5 stars each).', variant: 'error' });
      return;
    }
    try {
      setSubmittingReview(true);
      const payload = { category_scores: { ...category_scores }, comment: reviewData.comment || '' };
      await ratingsAPI.create(job.id, payload);
      setCurrentUserHasReviewed(true);
      setReviewedJobIds((prev) => new Set([...prev, job.id]));
      const updated = await ratingsAPI.getByJob(job.id);
      const ratingsList = Array.isArray(updated) ? updated : (updated.ratings || []);
      setRatings(ratingsList);
      setOtherPartyHasReviewed(Array.isArray(updated) ? false : (updated.other_party_has_reviewed ?? false));
      setCurrentUserHasReviewed(Array.isArray(updated) ? true : (updated.current_user_has_reviewed ?? true));
      setShowReviewForm(false);
      setReviewData({ category_scores: {}, comment: '' });
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to submit review', message: err.message || 'Failed to submit review', variant: 'error' });
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading job details...</div>
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

  if (!job) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Job not found</div>
      </div>
    );
  }

  const currentUser = user || auth.getUser();
  const acceptedApp = job?.job_applications?.find(app => app.status === 'accepted' || app.status === 1);
  const claimedTechnician = claimedTechnicianData || acceptedApp?.technician_profile;
  const isCompanyViewingOwnClaimedJob = currentUser?.role === 'company' && job?.company_profile_id === companyProfileId && (job?.status === 'reserved' || job?.status === 'finished' || job?.status === 'filled') && (claimedTechnician || acceptedApp?.technician_profile_id);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Link to="/dashboard" className="text-blue-600 hover:text-blue-800 text-sm">Dashboard</Link>
          <span className="text-gray-400">|</span>
          <button 
            onClick={handleBackToList} 
            className="flex items-center text-blue-600 hover:text-blue-800 text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Jobs
          </button>
        </div>
        
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{job.title}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {getStatusBadge(job)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-gray-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p className="font-medium">{job.location}</p>
                </div>
              </div>
              {((job?.job_amount_cents ?? job?.price_cents ?? 0) > 0) && (
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-gray-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-500">Job amount</p>
                    <p className="font-medium">${((job?.job_amount_cents ?? job?.price_cents ?? 0) / 100).toFixed(2)}</p>
                    {(job?.company_charge_cents ?? 0) > 0 && (
                      <p className="text-xs text-gray-500">You pay ${((job.company_charge_cents) / 100).toFixed(2)} (incl. 5% fee)</p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center md:col-span-2">
                <svg className="w-5 h-5 text-gray-400 mr-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1 min-w-0">
                  {isCompanyViewingOwnClaimedJob && claimedTechnician ? (
                    <>
                      <p className="text-sm text-gray-500">Technician</p>
                      <p className="font-medium flex items-center gap-2">
                        {claimedTechnician.user?.email || claimedTechnician.trade_type || 'Technician'}
                        {claimedTechnician.average_rating != null && (
                          <span className="inline-flex items-center text-amber-600 text-sm">
                            ★ {Number(claimedTechnician.average_rating).toFixed(1)}
                          </span>
                        )}
                      </p>
                      <Link
                        to={`/technicians/${claimedTechnician.id}`}
                        className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors"
                      >
                        View Technician Profile
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">Company</p>
                      <p className="font-medium flex items-center gap-2">
                        {job.company_profile?.company_name || 'Company'}
                        {job.company_profile?.average_rating != null && (
                          <span className="inline-flex items-center text-amber-600 text-sm">
                            ★ {Number(job.company_profile.average_rating).toFixed(1)}
                          </span>
                        )}
                      </p>
                      {currentUser?.role === 'technician' && (
                        <Link
                          to={`/companies/${job.company_profile_id ?? job.company_profile?.id ?? ''}`}
                          className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors"
                        >
                          View Company Profile
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 text-gray-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Industry</p>
                  <p className="font-medium">{job.company_profile?.industry || 'N/A'}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 text-gray-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Posted</p>
                  <p className="font-medium">
                    {new Date(job.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <svg className="w-5 h-5 text-gray-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Start</p>
                  <p className="font-medium">
                    {job.scheduled_start_at
                      ? new Date(job.scheduled_start_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Not scheduled'}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <svg className="w-5 h-5 text-gray-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Finish</p>
                  <p className="font-medium">
                    {job.scheduled_end_at
                      ? new Date(job.scheduled_end_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Not scheduled'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Job Description</h3>
              <p className="text-gray-700 leading-relaxed">{job.description}</p>
            </div>

            {(job.skill_class || job.minimum_years_experience != null) && (
              <div className="mb-6 flex flex-wrap gap-6 text-sm">
                {job.skill_class && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Class</p>
                    <p className="font-medium text-gray-900">{job.skill_class}</p>
                  </div>
                )}
                {job.minimum_years_experience != null && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Experience</p>
                    <p className="font-medium text-gray-900">{formatExperienceLong(job.minimum_years_experience)}</p>
                  </div>
                )}
              </div>
            )}

            {job.notes && (
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 mb-2">Notes and conditions</h3>
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{job.notes}</p>
              </div>
            )}

            {job.required_documents && (
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Required Documents</h3>
                <p className="text-gray-700">{job.required_documents}</p>
              </div>
            )}

            {job.required_certifications && (
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Required Certifications</h3>
                <p className="text-gray-700">{job.required_certifications}</p>
                <p className="text-sm text-gray-500 mt-1">Techs must have certificate images posted. Companies verify they match job requirements.</p>
              </div>
            )}

            {(job.status === 'finished' || job.status === 'filled') && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Reviews</h3>
                {canLeaveReview() && !hasAlreadyReviewed() && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
                    {otherPartyHasReviewed
                      ? `${user?.role === 'technician' ? 'Company' : 'Technician'} has left a review. Complete yours to view theirs.`
                      : 'Reviews are hidden until you submit yours or 7 days have passed—so your feedback stays independent.'}
                  </p>
                )}
                <div className="space-y-4">
                  {ratings?.map((r) => (
                    <div key={r.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">
                          {r.reviewer_type === 'CompanyProfile' ? 'Company' : 'Technician'} review
                        </span>
                        <span className="inline-flex items-center text-amber-600 font-medium">
                          ★ {r.score != null ? Number(r.score).toFixed(1) : '—'} overall
                        </span>
                      </div>
                      {r.category_scores && Object.keys(r.category_scores).length > 0 && r.category_labels ? (
                        <div className="space-y-2 mb-3">
                          {Object.entries(r.category_scores).map(([k, v]) => (
                            <div key={k} className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">{r.category_labels[k] || k}</span>
                              <span className="inline-flex items-center text-amber-600 font-medium">
                                {v}/5 ★
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mb-2">Overall rating only (legacy review)</p>
                      )}
                      {r.comment && <p className="text-gray-700 text-sm border-t border-gray-200 pt-2 mt-2">{r.comment}</p>}
                    </div>
                  ))}
                </div>
                {canLeaveReview() && (
                  <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                    {hasAlreadyReviewed() ? (
                      <p className="text-sm text-gray-600">You have already reviewed for this job.</p>
                    ) : showReviewForm ? (
                      <form onSubmit={handleReviewSubmit} className="space-y-4">
                        <h4 className="font-medium text-gray-900">Leave your review for {user?.role === 'company' ? 'the technician' : 'the company'}</h4>
                        <p className="text-sm text-gray-600">Rate each aspect from 1 to 5 stars.</p>
                        <div className="space-y-4">
                          {Object.entries(reviewCategories).map(([key, label]) => (
                            <div key={key}>
                              <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                              <StarRating
                                value={reviewData.category_scores[key] ?? 5}
                                onChange={(v) => setReviewData(prev => ({
                                  ...prev,
                                  category_scores: { ...prev.category_scores, [key]: v },
                                }))}
                              />
                            </div>
                          ))}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Comment (optional)</label>
                          <textarea
                            value={reviewData.comment}
                            onChange={e => setReviewData(prev => ({ ...prev, comment: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            rows={3}
                            placeholder="How did the job go?"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setShowReviewForm(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
                          <button type="submit" disabled={submittingReview} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                            {submittingReview ? 'Submitting...' : 'Submit Review'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 mb-3">
                          Rate your experience with {user?.role === 'company' ? 'the technician' : 'the company'}.
                        </p>
                        <button onClick={() => setShowReviewForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                          Leave Review
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          {currentUser?.role === 'technician' && job.status === 'open' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Claim this Job</h3>
              <p className="text-sm text-gray-600 mb-4">
                First come, first served. Click below to claim this job—it will be yours immediately.
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleClaimJob}
                  disabled={claiming}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {claiming ? 'Claiming...' : 'Claim Job'}
                </button>
                <button
                  onClick={handleMessageCompany}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Message Company
                </button>
              </div>
            </div>
          )}

          {currentUser?.role === 'technician' && (job.status === 'reserved' || job.status === 'filled') && isJobClaimedByMe() && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Your Job</h3>
              <p className="text-sm text-gray-600 mb-4">
                You claimed this job. When you finish the work, mark it complete below—or the company can mark it.
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleMessageCompany}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Message Company
                </button>
                <button
                  onClick={handleMarkComplete}
                  disabled={markingComplete}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {markingComplete ? 'Marking...' : 'Mark Job Complete'}
                </button>
              </div>
            </div>
          )}

          {currentUser?.role === 'technician' && job.status === 'finished' && isJobClaimedByMe() && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-6">
              <button
                onClick={handleMessageCompany}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Message Company
              </button>
            </div>
          )}

          {(job.status === 'finished' || job.status === 'filled') && canLeaveReview() && !hasAlreadyReviewed() && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Leave a Review</h3>
              {otherPartyHasReviewed && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
                  {user?.role === 'technician' ? 'Company' : 'Technician'} has left a review. Complete yours to view theirs.
                </p>
              )}
              <button
                onClick={() => setShowReviewForm(true)}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Leave a Review
              </button>
            </div>
          )}

          {user && user.role === 'company' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Company Actions</h3>
              <div className="space-y-3">
                {(job.status === 'reserved' || job.status === 'filled' || job.status === 'finished') && claimedTechnician && (
                  <>
                    <button onClick={handleMessageCompany} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                      Message Technician
                    </button>
                    <button onClick={openClaimedModal} className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
                      View Claimed By
                    </button>
                    {job.status !== 'finished' && (
                      <>
                        <button onClick={handleDenyTechnician} disabled={denying} className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50">
                          {denying ? 'Denying...' : 'Deny Technician'}
                        </button>
                        <button onClick={handleMarkComplete} disabled={markingComplete} className="w-full px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50">
                          {markingComplete ? 'Marking...' : 'Mark Job Complete'}
                        </button>
                        <Link
                          to={`/jobs/${job.id}/edit`}
                          className="block w-full px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors text-center"
                        >
                          Extend Job
                        </Link>
                      </>
                    )}
                  </>
                )}
                <button onClick={openEditModal} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                  Edit Job
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
      {/* Edit Job Modal */}
      <Modal isOpen={showEditModal} onRequestClose={closeEditModal} ariaHideApp={false} className="fixed inset-0 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">Edit Job</h2>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea name="description" value={editData.description} onChange={handleEditChange} className="w-full border rounded p-2" rows={4} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Class</label>
                <input name="skill_class" value={editData.skill_class} onChange={handleEditChange} className="w-full border rounded p-2" placeholder="e.g. Journeyman" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Experience</label>
                <select
                  name="minimum_years_experience"
                  value={editData.minimum_years_experience}
                  onChange={handleEditChange}
                  className="w-full border rounded p-2 bg-white"
                >
                  {EXPERIENCE_YEAR_OPTIONS.map(({ value, label }) => (
                    <option key={value === '' ? 'any' : value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes and conditions</label>
              <textarea name="notes" value={editData.notes} onChange={handleEditChange} className="w-full border rounded p-2 min-h-[80px]" rows={4} placeholder="Safety, site requirements, etc." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Required Certifications</label>
              <div className="space-y-2">
                {(editData.required_certifications || ['']).map((cert, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      className="flex-1 border rounded p-2"
                      value={cert}
                      onChange={(e) => handleEditCertChange(idx, e.target.value)}
                      placeholder="e.g. OSHA 10, EPA 608"
                    />
                    <button
                      type="button"
                      onClick={() => handleEditCertRemove(idx)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded border border-red-200 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleEditCertAdd}
                  className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 font-medium text-sm"
                >
                  + Add certification
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input name="location" value={editData.location} onChange={handleEditChange} className="w-full border rounded p-2" required />
            </div>
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
              <h3 className="font-medium text-gray-900">Price</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Hourly rate ($)</label>
                  <input type="number" name="hourly_rate_cents" value={editData.hourly_rate_cents} onChange={handleEditChange} className="w-full border rounded p-2" min="0" step="0.01" placeholder="e.g. 25.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hours/day</label>
                  <input type="number" name="hours_per_day" value={editData.hours_per_day} onChange={handleEditChange} className="w-full border rounded p-2" min="1" max="24" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Days</label>
                  <input type="number" name="days" value={editData.days} onChange={handleEditChange} className="w-full border rounded p-2" min="0" placeholder="e.g. 3" />
                </div>
              </div>
              {(() => {
                const hr = parseFloat(editData.hourly_rate_cents) || 0;
                const hpd = parseInt(editData.hours_per_day, 10) || 8;
                const d = parseInt(editData.days, 10) || 0;
                const amt = hr * hpd * d;
                return amt > 0 ? <p className="text-sm text-gray-600">Job amount: ${amt.toFixed(2)} (you pay ${(amt * 1.05).toFixed(2)} incl. 5% fee)</p> : null;
              })()}
            </div>
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
              <h3 className="font-medium text-gray-900">Schedule</h3>
              <div>
                <label className="block text-sm font-medium mb-1">Start date & time</label>
                <input type="datetime-local" name="scheduled_start_at" value={editData.scheduled_start_at} onChange={handleEditChange} className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End date & time</label>
                <input type="datetime-local" name="scheduled_end_at" value={editData.scheduled_end_at} onChange={handleEditChange} className="w-full border rounded p-2" />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={closeEditModal} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      </Modal>
      <MessageModal
        isOpen={showMessageModal}
        onClose={() => { setShowMessageModal(false); setMessageConversationId(null); }}
        conversationId={messageConversationId}
        jobTitle={job?.title}
        currentUserRole={user?.role}
      />
      {/* View Claimed By Modal */}
      <Modal isOpen={showClaimedModal} onRequestClose={closeClaimedModal} ariaHideApp={false} className="fixed inset-0 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded shadow-lg w-full max-w-lg">
          <h2 className="text-xl font-bold mb-4">Claimed By</h2>
          {loadingClaimed ? <div>Loading...</div> : (
            <div className="space-y-4">
              {claimedBy ? (
                <div className="border rounded p-4">
                  <div className="font-semibold flex items-center gap-2">
                    <Link
                      to={`/technicians/${claimedBy.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {claimedBy.user?.email || 'Technician'}
                    </Link>
                    {claimedBy.average_rating != null && (
                      <span className="text-amber-600 text-sm">★ {Number(claimedBy.average_rating).toFixed(1)}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{claimedBy.trade_type || '—'} • {claimedBy.experience_years ?? '—'} years experience</div>
                  <Link
                    to={`/technicians/${claimedBy.id}`}
                    className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View full profile & reviews →
                  </Link>
                </div>
              ) : (
                <p className="text-gray-500">No one has claimed this job yet.</p>
              )}
            </div>
          )}
          <div className="flex justify-end mt-4">
            <button onClick={closeClaimedModal} className="px-4 py-2 bg-gray-200 rounded">Close</button>
          </div>
        </div>
      </Modal>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />

      <ConfirmModal
        isOpen={showDenyConfirm}
        onClose={() => setShowDenyConfirm(false)}
        onConfirm={confirmDenyTechnician}
        title="Deny technician?"
        message="Are you sure you want to deny this technician? The job will be reopened and any payment will be refunded."
        confirmLabel="Yes, deny"
        cancelLabel="Cancel"
        variant="destructive"
      />
    </div>
  );
};

export default JobDetail; 