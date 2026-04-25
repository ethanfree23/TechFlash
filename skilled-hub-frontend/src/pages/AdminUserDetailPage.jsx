import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AdminCollapsibleCard from '../components/AdminCollapsibleCard';
import AdminCreateUserModal from '../components/AdminCreateUserModal';
import { ServiceCityPicker } from '../components/admin/AdminUserFormPickers';
import { adminUsersAPI, adminReferralsAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import { auth } from '../auth';
import { FaEye } from 'react-icons/fa';
import { formatPhoneInput } from '../utils/phone';

const PERIODS = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

function fmtMoney(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

export default function AdminUserDetailPage({ user, onLogout }) {
  const { userId } = useParams();
  const [period, setPeriod] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'error',
  });
  const [accessBusy, setAccessBusy] = useState(false);
  const [manualResetUrl, setManualResetUrl] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [manualPasswordConfirmation, setManualPasswordConfirmation] = useState('');
  const [issuingReferralId, setIssuingReferralId] = useState(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [membershipSaveBusy, setMembershipSaveBusy] = useState(false);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [masqueradeBusy, setMasqueradeBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await adminUsersAPI.get(userId, period);
      setData(res);
    } catch (e) {
      setData(null);
      setAlertModal({
        isOpen: true,
        title: 'Could not load user',
        message: e.message || 'Failed',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setProfileEditing(false);
  }, [userId]);

  const u = data?.user;
  const profile = u?.profile;
  const isCompany = data?.role_key === 'company' || u?.role === 'company';
  const isTech = data?.role_key === 'technician' || u?.role === 'technician';
  const canManagePassword = isCompany || isTech;
  const membershipLevel = profile?.membership_level || 'basic';
  const effectiveMembershipFeeCents = profile?.effective_membership_fee_cents ?? 0;
  const effectiveCommissionPercent = profile?.effective_commission_percent ?? 0;
  const billingExempt = !!profile?.membership_fee_waived;

  const sendSetupEmail = async () => {
    if (!u?.id) return;
    setAccessBusy(true);
    try {
      const res = await adminUsersAPI.sendPasswordSetup(u.id, { sendEmail: true });
      setManualResetUrl(res?.reset_url || '');
      setAlertModal({
        isOpen: true,
        title: 'Setup email sent',
        message: `A new password setup email was sent to ${u.email}.`,
        variant: 'success',
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not send setup email',
        message: e.message || 'Request failed',
        variant: 'error',
      });
    } finally {
      setAccessBusy(false);
    }
  };

  const generateManualLink = async () => {
    if (!u?.id) return;
    setAccessBusy(true);
    try {
      const res = await adminUsersAPI.sendPasswordSetup(u.id, { sendEmail: false });
      setManualResetUrl(res?.reset_url || '');
      setAlertModal({
        isOpen: true,
        title: 'Manual setup link generated',
        message: 'Use the generated link below in your own email or message to the user.',
        variant: 'success',
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not generate setup link',
        message: e.message || 'Request failed',
        variant: 'error',
      });
    } finally {
      setAccessBusy(false);
    }
  };

  const copyManualLink = async () => {
    if (!manualResetUrl) return;
    try {
      await navigator.clipboard.writeText(manualResetUrl);
      setAlertModal({
        isOpen: true,
        title: 'Link copied',
        message: 'Setup link copied to clipboard.',
        variant: 'success',
      });
    } catch {
      setAlertModal({
        isOpen: true,
        title: 'Copy failed',
        message: 'Could not copy automatically. Copy the link manually from the field.',
        variant: 'error',
      });
    }
  };

  const applyManualPassword = async (e) => {
    e.preventDefault();
    if (!u?.id) return;
    setAccessBusy(true);
    try {
      await adminUsersAPI.setPassword(u.id, manualPassword, manualPasswordConfirmation);
      setManualPassword('');
      setManualPasswordConfirmation('');
      setAlertModal({
        isOpen: true,
        title: 'Password updated',
        message: `Password was set for ${u.email}. Share it through a secure channel.`,
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not set password',
        message: err.message || 'Request failed',
        variant: 'error',
      });
    } finally {
      setAccessBusy(false);
    }
  };

  const markRewardIssued = async (referralId) => {
    setIssuingReferralId(referralId);
    try {
      await adminReferralsAPI.issueReward(referralId);
      await load();
      setAlertModal({
        isOpen: true,
        title: 'Gift card marked issued',
        message: 'The referral has been marked as paid out.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not mark issued',
        message: err.message || 'Request failed',
        variant: 'error',
      });
    } finally {
      setIssuingReferralId(null);
    }
  };

  const beginProfileEdit = () => {
    if (!profile) return;
    if (isCompany) {
      setProfileDraft({
        first_name: u?.first_name || '',
        last_name: u?.last_name || '',
        company_name: profile.company_name || '',
        industry: profile.industry || '',
        location: profile.location || '',
        bio: profile.bio || '',
        phone: profile.phone || '',
        website_url: profile.website_url || '',
        facebook_url: profile.facebook_url || '',
        instagram_url: profile.instagram_url || '',
        linkedin_url: profile.linkedin_url || '',
        service_cities: Array.isArray(profile.service_cities) ? [...profile.service_cities] : [],
      });
    } else if (isTech) {
      setProfileDraft({
        first_name: u?.first_name || '',
        last_name: u?.last_name || '',
        trade_type: profile.trade_type || '',
        location: profile.location || '',
        experience_years: profile.experience_years != null ? String(profile.experience_years) : '',
        availability: profile.availability || '',
        bio: profile.bio || '',
      });
    }
    setProfileEditing(true);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!u?.id || !profile) return;
    setProfileSaveBusy(true);
    try {
      const payload =
        isCompany
          ? {
              first_name: profileDraft.first_name?.trim() || null,
              last_name: profileDraft.last_name?.trim() || null,
              company_name: profileDraft.company_name?.trim(),
              industry: profileDraft.industry?.trim(),
              location: profileDraft.location?.trim(),
              bio: profileDraft.bio?.trim(),
              phone: profileDraft.phone?.trim(),
              website_url: profileDraft.website_url?.trim() || null,
              facebook_url: profileDraft.facebook_url?.trim() || null,
              instagram_url: profileDraft.instagram_url?.trim() || null,
              linkedin_url: profileDraft.linkedin_url?.trim() || null,
              service_cities: Array.isArray(profileDraft.service_cities) ? profileDraft.service_cities : [],
            }
          : {
              first_name: profileDraft.first_name?.trim() || null,
              last_name: profileDraft.last_name?.trim() || null,
              trade_type: profileDraft.trade_type?.trim(),
              location: profileDraft.location?.trim(),
              availability: profileDraft.availability?.trim(),
              bio: profileDraft.bio?.trim(),
              experience_years:
                profileDraft.experience_years === '' || profileDraft.experience_years == null
                  ? null
                  : parseInt(profileDraft.experience_years, 10),
            };
      await adminUsersAPI.updateProfile(u.id, payload);
      setProfileEditing(false);
      await load();
      setAlertModal({
        isOpen: true,
        title: 'Profile saved',
        message: 'Profile information was updated.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not save profile',
        message: err.message || 'Request failed',
        variant: 'error',
      });
    } finally {
      setProfileSaveBusy(false);
    }
  };

  const toggleBillingExempt = async (nextChecked) => {
    if (!u?.id || !isCompany) return;
    setMembershipSaveBusy(true);
    try {
      await adminUsersAPI.updateMembershipPricing(u.id, {
        membership_fee_waived: nextChecked,
      });
      await load();
      setAlertModal({
        isOpen: true,
        title: 'Billing updated',
        message: nextChecked
          ? 'Billing exemption enabled. Membership fee and commission are now effectively 0 while tier stays unchanged.'
          : 'Billing exemption disabled. Tier pricing now applies normally.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not update billing exemption',
        message: err.message || 'Request failed',
        variant: 'error',
      });
    } finally {
      setMembershipSaveBusy(false);
    }
  };

  const startMasquerade = async () => {
    if (!u?.id || !(isCompany || isTech)) return;
    setMasqueradeBusy(true);
    try {
      const res = await adminUsersAPI.masqueradeStart(u.id);
      auth.enterMasquerade(res.token, res.user);
      window.location.assign('/dashboard');
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Masquerade failed',
        message: err.message || 'Could not start masquerade session',
        variant: 'error',
      });
    } finally {
      setMasqueradeBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="users" emailVariant="crm" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link to="/admin/users" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            ← Back to Users
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{u?.email || 'User'}</h1>
            <p className="text-sm text-gray-500 mt-1 capitalize">
              {u?.role}
              {profile?.company_name && ` · ${profile.company_name}`}
              {profile?.trade_type && ` · ${profile.trade_type}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-end">
            {(isCompany || isTech) && u?.id && (
              <button
                type="button"
                disabled={masqueradeBusy}
                onClick={startMasquerade}
                title="Open the app as this user"
                aria-label="View as this user"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
              >
                {masqueradeBusy ? (
                  'Starting…'
                ) : (
                  <>
                    <FaEye className="text-base shrink-0" aria-hidden />
                    View as this user
                  </>
                )}
              </button>
            )}
            <span className="text-xs font-medium text-gray-500 uppercase mr-1">Metrics window</span>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  period === p.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="text-gray-500">Loading analytics…</p>}

        {!loading && data && (
          <div className="space-y-8">
            <AdminCollapsibleCard
              title="Profile"
              actions={
                (isCompany || isTech) && profile ? (
                  profileEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setProfileEditing(false)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        form={isCompany ? 'admin-profile-company-form' : 'admin-profile-tech-form'}
                        disabled={profileSaveBusy}
                        className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {profileSaveBusy ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={beginProfileEdit}
                      className="px-3 py-1.5 text-sm font-semibold text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
                    >
                      Edit
                    </button>
                  )
                ) : null
              }
            >
              {!profileEditing ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-500">User ID</dt>
                    <dd className="font-medium text-gray-900">{u?.id}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Joined</dt>
                    <dd className="font-medium text-gray-900">
                      {u?.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                    </dd>
                  </div>
                  {isCompany && profile && (
                    <>
                      <div>
                        <dt className="text-gray-500">Contact first name</dt>
                        <dd className="font-medium text-gray-900">{u?.first_name || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Contact last name</dt>
                        <dd className="font-medium text-gray-900">{u?.last_name || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Company name</dt>
                        <dd className="font-medium text-gray-900">{profile.company_name || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Industry</dt>
                        <dd className="font-medium text-gray-900">{profile.industry || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Phone</dt>
                        <dd className="font-medium text-gray-900">{profile.phone || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Location</dt>
                        <dd className="font-medium text-gray-900">{profile.location || '—'}</dd>
                      </div>
                      {Array.isArray(profile.service_cities) && profile.service_cities.length > 0 && (
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Service cities</dt>
                          <dd className="font-medium text-gray-900">{profile.service_cities.join(', ')}</dd>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <dt className="text-gray-500">Bio</dt>
                        <dd className="font-medium text-gray-900 whitespace-pre-wrap">{profile.bio || '—'}</dd>
                      </div>
                    </>
                  )}
                  {isTech && profile && (
                    <>
                      <div>
                        <dt className="text-gray-500">Trade</dt>
                        <dd className="font-medium text-gray-900">{profile.trade_type || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Location</dt>
                        <dd className="font-medium text-gray-900">{profile.location || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Experience (years)</dt>
                        <dd className="font-medium text-gray-900">{profile.experience_years ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Availability</dt>
                        <dd className="font-medium text-gray-900">{profile.availability || '—'}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-gray-500">Bio</dt>
                        <dd className="font-medium text-gray-900 whitespace-pre-wrap">{profile.bio || '—'}</dd>
                      </div>
                    </>
                  )}
                  {isCompany && u?.company_context?.company_profile_id && (
                    <div>
                      <dt className="text-gray-500">Company profile</dt>
                      <dd>
                        <Link
                          to={`/companies/${u.company_context.company_profile_id}`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          {u.company_context.company_name || `Company #${u.company_context.company_profile_id}`} →
                        </Link>
                      </dd>
                    </div>
                  )}
                  {profile?.stripe_customer_id != null && (
                    <div>
                      <dt className="text-gray-500">Stripe customer</dt>
                      <dd className="font-mono text-xs text-gray-800 break-all">{profile.stripe_customer_id}</dd>
                    </div>
                  )}
                  {profile?.stripe_account_id != null && (
                    <div>
                      <dt className="text-gray-500">Stripe Connect</dt>
                      <dd className="font-mono text-xs text-gray-800 break-all">{profile.stripe_account_id}</dd>
                    </div>
                  )}
                </dl>
              ) : isCompany ? (
                <form id="admin-profile-company-form" onSubmit={saveProfile} className="space-y-4">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-b border-gray-100 pb-4 mb-4">
                    <div>
                      <dt className="text-gray-500">User ID</dt>
                      <dd className="font-medium text-gray-900">{u?.id}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Joined</dt>
                      <dd className="font-medium text-gray-900">
                        {u?.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Contact first name</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.first_name || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, first_name: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Contact last name</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.last_name || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, last_name: e.target.value }))}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Company name</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.company_name || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, company_name: e.target.value }))}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Industry</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.industry || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, industry: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Phone</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.phone || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, phone: formatPhoneInput(e.target.value) }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Location (summary)</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.location || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, location: e.target.value }))}
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Service cities</span>
                      <ServiceCityPicker
                        inputId="admin-user-detail-service-cities"
                        value={profileDraft.service_cities || []}
                        onChange={(cities) => setProfileDraft((d) => ({ ...d, service_cities: cities }))}
                      />
                    </div>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Bio</span>
                      <textarea
                        rows={3}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.bio || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, bio: e.target.value }))}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Website</span>
                      <input
                        type="url"
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.website_url || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, website_url: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Facebook</span>
                      <input
                        type="url"
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.facebook_url || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, facebook_url: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Instagram</span>
                      <input
                        type="url"
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.instagram_url || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, instagram_url: e.target.value }))}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">LinkedIn</span>
                      <input
                        type="url"
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.linkedin_url || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, linkedin_url: e.target.value }))}
                      />
                    </label>
                  </div>
                </form>
              ) : (
                <form id="admin-profile-tech-form" onSubmit={saveProfile} className="space-y-4">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-b border-gray-100 pb-4 mb-4">
                    <div>
                      <dt className="text-gray-500">User ID</dt>
                      <dd className="font-medium text-gray-900">{u?.id}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Joined</dt>
                      <dd className="font-medium text-gray-900">
                        {u?.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">First name</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.first_name || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, first_name: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Last name</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.last_name || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, last_name: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Trade</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.trade_type || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, trade_type: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Location</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.location || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, location: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Years experience</span>
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.experience_years ?? ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, experience_years: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Availability</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.availability || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, availability: e.target.value }))}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Bio</span>
                      <textarea
                        rows={3}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={profileDraft.bio || ''}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, bio: e.target.value }))}
                      />
                    </label>
                  </div>
                </form>
              )}
            </AdminCollapsibleCard>

            {isCompany && profile && (
              <AdminCollapsibleCard
                title="Membership billing"
                description="Keep tier access while toggling billing exemption for this company."
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <Stat label="Tier" value={membershipLevel} />
                  <Stat label="Effective monthly fee" value={fmtMoney(effectiveMembershipFeeCents)} />
                  <Stat label="Effective commission" value={`${Number(effectiveCommissionPercent || 0).toFixed(2)}%`} />
                </div>
                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={billingExempt}
                    disabled={membershipSaveBusy}
                    onChange={(e) => toggleBillingExempt(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">Billing exempt</span>
                    <br />
                    Keeps current tier but makes effective membership fee and commission 0. Also allows posting jobs without a saved card.
                  </span>
                </label>
              </AdminCollapsibleCard>
            )}

            {isCompany && u?.company_context && (
              <AdminCollapsibleCard
                title="Company login users"
                description="Accounts linked to this company profile."
                actions={
                  <button
                    type="button"
                    onClick={() => setCreateUserModalOpen(true)}
                    className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Add user
                  </button>
                }
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Joined</th>
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(u.company_context.users || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-gray-500">
                            No linked accounts yet. Use Add user to create one.
                          </td>
                        </tr>
                      ) : (
                        u.company_context.users.map((member) => (
                          <tr key={member.id} className="border-b border-gray-50">
                            <td className="py-2 pr-4 text-gray-700">
                              {[member.first_name, member.last_name].filter(Boolean).join(' ') || '—'}
                            </td>
                            <td className="py-2 pr-4">{member.email}</td>
                            <td className="py-2 pr-4 text-gray-600">
                              {member.created_at ? new Date(member.created_at).toLocaleString() : '—'}
                            </td>
                            <td className="py-2 pr-4 text-gray-600">
                              {member.id === u.company_context.company_profile_owner_user_id ? 'Primary owner' : 'Contact login'}
                            </td>
                            <td className="py-2">
                              {String(member.id) === String(userId) ? (
                                <span className="text-gray-400 font-medium">Current</span>
                              ) : (
                                <Link to={`/admin/users/${member.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                                  View →
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </AdminCollapsibleCard>
            )}

            {canManagePassword && (
              <AdminCollapsibleCard title="Access management" description="Send a new setup email, generate a manual setup link, or set a password directly for this account.">
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    disabled={accessBusy}
                    onClick={sendSetupEmail}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    Send setup email
                  </button>
                  <button
                    type="button"
                    disabled={accessBusy}
                    onClick={generateManualLink}
                    className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50"
                  >
                    Generate manual setup link
                  </button>
                </div>
                {manualResetUrl && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Manual setup link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={manualResetUrl}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={copyManualLink}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                <form onSubmit={applyManualPassword} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Set password</span>
                    <input
                      type="password"
                      value={manualPassword}
                      onChange={(e) => setManualPassword(e.target.value)}
                      minLength={6}
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Confirm password</span>
                    <input
                      type="password"
                      value={manualPasswordConfirmation}
                      onChange={(e) => setManualPasswordConfirmation(e.target.value)}
                      minLength={6}
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-gray-500 mb-2">
                      Password must be at least 6 characters and include uppercase, lowercase, number, and special character.
                    </p>
                    <button
                      type="submit"
                      disabled={accessBusy}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50"
                    >
                      Save password
                    </button>
                  </div>
                </form>
              </AdminCollapsibleCard>
            )}

            <AdminCollapsibleCard title="Logins">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <Stat label="In period" value={data.logins?.total_in_period ?? '—'} />
                <Stat label="All time" value={data.logins?.total_all_time ?? '—'} />
                <Stat
                  label="Last login"
                  value={
                    data.logins?.last_login_at
                      ? new Date(data.logins.last_login_at).toLocaleString()
                      : 'Never'
                  }
                />
              </div>
              {data.logins?.recent?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent (20)</h3>
                  <ul className="text-sm text-gray-700 space-y-1 max-h-48 overflow-y-auto">
                    {data.logins.recent.map((row, i) => (
                      <li key={i}>{row.at ? new Date(row.at).toLocaleString() : '—'}</li>
                    ))}
                  </ul>
                </div>
              )}
            </AdminCollapsibleCard>

            <AdminCollapsibleCard title="Messages">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Stat label="Job threads (period)" value={data.messages?.job_threads_sent_in_period ?? 0} />
                <Stat label="Job threads (all time)" value={data.messages?.job_threads_sent_all_time ?? 0} />
                <Stat label="Feedback (period)" value={data.messages?.feedback_messages_sent_in_period ?? 0} />
                <Stat label="Feedback (all time)" value={data.messages?.feedback_messages_sent_all_time ?? 0} />
              </div>
            </AdminCollapsibleCard>

            {data.referrals && (
              <AdminCollapsibleCard title="Referrals">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
                  <Stat label="Sent (window)" value={data.referrals.sent_in_period ?? 0} />
                  <Stat label="Sent (all time)" value={data.referrals.sent_total ?? 0} />
                  <Stat label="Gift card eligible" value={data.referrals.reward_eligible_total ?? 0} />
                  <Stat label="Gift card issued" value={data.referrals.reward_issued_total ?? 0} />
                </div>
                {(data.referrals.recent || []).length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-4">Referral</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-4">Submitted</th>
                          <th className="py-2 pr-4">Eligible</th>
                          <th className="py-2 pr-4">Issued</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.referrals.recent.map((r) => (
                          <tr key={r.id} className="border-b border-gray-50">
                            <td className="py-2 pr-4">{`${r.first_name} ${r.last_name}`} ({r.email})</td>
                            <td className="py-2 pr-4 uppercase">{r.referred_type}</td>
                            <td className="py-2 pr-4">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                            <td className="py-2 pr-4">{r.reward_eligible_at ? new Date(r.reward_eligible_at).toLocaleString() : 'No'}</td>
                            <td className="py-2 pr-4">
                              {r.reward_issued_at ? (
                                <span className="text-emerald-700 font-medium">{new Date(r.reward_issued_at).toLocaleString()}</span>
                              ) : r.reward_eligible_at ? (
                                <button
                                  type="button"
                                  disabled={issuingReferralId === r.id}
                                  onClick={() => markRewardIssued(r.id)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {issuingReferralId === r.id ? 'Saving…' : 'Mark issued'}
                                </button>
                              ) : (
                                <span className="text-gray-500">Not eligible</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCollapsibleCard>
            )}

            {isCompany && data.jobs && (
              <AdminCollapsibleCard title="Jobs (company)">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <Stat label="Total jobs" value={data.jobs.total ?? 0} />
                  <Stat label="Posted in window" value={data.jobs.in_period ?? 0} />
                </div>
                {data.jobs.by_status && Object.keys(data.jobs.by_status).length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">By status</h3>
                    <ul className="flex flex-wrap gap-2">
                      {Object.entries(data.jobs.by_status).map(([k, v]) => (
                        <li key={k} className="px-2 py-1 bg-gray-100 rounded text-sm">
                          {k}: <strong>{v}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.jobs.recent?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent jobs</h3>
                    <ul className="divide-y divide-gray-100">
                      {data.jobs.recent.map((j) => (
                        <li key={j.id} className="py-2 flex justify-between gap-4 text-sm">
                          <span className="font-medium text-gray-900">{j.title}</span>
                          <span className="text-gray-500 capitalize">{j.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AdminCollapsibleCard>
            )}

            {isTech && data.jobs && data.applications && (
              <AdminCollapsibleCard title="Jobs & applications">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <Stat label="Accepted jobs (total)" value={data.jobs.accepted_total ?? 0} />
                    <Stat label="Accepted (window)" value={data.jobs.accepted_in_period ?? 0} />
                    <Stat label="Applications (total)" value={data.applications.total ?? 0} />
                    <Stat label="Applications (window)" value={data.applications.in_period ?? 0} />
                  </div>
                  {data.applications.by_status && (
                    <ul className="flex flex-wrap gap-2 mb-4">
                      {Object.entries(data.applications.by_status).map(([k, v]) => (
                        <li key={k} className="px-2 py-1 bg-gray-100 rounded text-sm capitalize">
                          {k}: <strong>{v}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.jobs.recent?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent accepted jobs</h3>
                      <ul className="divide-y divide-gray-100">
                        {data.jobs.recent.map((j) => (
                          <li key={j.id} className="py-2 flex justify-between gap-4 text-sm">
                            <span className="font-medium text-gray-900">{j.title}</span>
                            <span className="text-gray-500 capitalize">{j.status}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </AdminCollapsibleCard>
            )}

            {data.payments && (
              <AdminCollapsibleCard title={isCompany ? 'Payments (company)' : 'Payments (technician)'}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {isCompany && (
                    <>
                      <Stat label="Spent (released, all time)" value={fmtMoney(data.payments.spent_released_cents_all_time)} />
                      <Stat label="Spent (released, window)" value={fmtMoney(data.payments.spent_released_cents_in_period)} />
                    </>
                  )}
                  {isTech && (
                    <>
                      <Stat label="Earned (released, all time)" value={fmtMoney(data.payments.earned_released_cents_all_time)} />
                      <Stat label="Earned (released, window)" value={fmtMoney(data.payments.earned_released_cents_in_period)} />
                    </>
                  )}
                </div>
                {data.payments.recent?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-4">Job</th>
                          <th className="py-2 pr-4">Amount</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2">Released</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.recent.map((p) => (
                          <tr key={p.id} className="border-b border-gray-50">
                            <td className="py-2 pr-4">{p.job_title || `#${p.job_id}`}</td>
                            <td className="py-2 pr-4">{fmtMoney(p.amount_cents)}</td>
                            <td className="py-2 pr-4 capitalize">{p.status}</td>
                            <td className="py-2 text-gray-600">
                              {p.released_at ? new Date(p.released_at).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCollapsibleCard>
            )}

            {data.ratings && (
              <AdminCollapsibleCard title="Ratings & reviews">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <Stat label="Received (total)" value={data.ratings.received_total ?? 0} />
                  <Stat label="Received (window)" value={data.ratings.received_in_period ?? 0} />
                  <Stat label="Given (total)" value={data.ratings.given_total ?? 0} />
                  <Stat label="Given (window)" value={data.ratings.given_in_period ?? 0} />
                </div>
                {data.ratings.avg_score_received != null && (
                  <p className="text-sm text-gray-700 mb-4">
                    Average score received: <strong>{data.ratings.avg_score_received}</strong> / 5
                  </p>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent received</h3>
                    <ul className="space-y-3 text-sm">
                      {(data.ratings.recent_received || []).map((r) => (
                        <li key={r.id} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-gray-900">{r.job_title || 'Job'}</span>
                            <span className="text-amber-700">{r.score != null ? `${r.score}★` : '—'}</span>
                          </div>
                          {r.comment && <p className="text-gray-600 mt-1">{r.comment}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent given</h3>
                    <ul className="space-y-3 text-sm">
                      {(data.ratings.recent_given || []).map((r) => (
                        <li key={r.id} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-gray-900">{r.job_title || 'Job'}</span>
                            <span className="text-amber-700">{r.score != null ? `${r.score}★` : '—'}</span>
                          </div>
                          {r.comment && <p className="text-gray-600 mt-1">{r.comment}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </AdminCollapsibleCard>
            )}
          </div>
        )}
      </main>

      {isCompany && u?.company_context && (
        <AdminCreateUserModal
          isOpen={createUserModalOpen}
          onClose={() => setCreateUserModalOpen(false)}
          presetCompanyProfile={{
            id: u.company_context.company_profile_id,
            company_name: u.company_context.company_name,
            company_users_count: (u.company_context.users || []).length,
          }}
          onCompleted={async ({ kind }) => {
            await load();
            const messages = {
              company_link:
                'Company contact login was created and linked. They were emailed a secure password setup link.',
              company_new:
                'Company user created. They were emailed a link to set a secure password.',
              technician: 'Technician account created.',
            };
            setAlertModal({
              isOpen: true,
              title: 'User created',
              message: messages[kind] || 'Done.',
              variant: 'success',
            });
          }}
          onError={(msg) =>
            setAlertModal({
              isOpen: true,
              title: 'Create failed',
              message: msg || 'Could not create user',
              variant: 'error',
            })
          }
        />
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
        onClose={() => setAlertModal((m) => ({ ...m, isOpen: false }))}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
      <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
      <div className="text-lg font-semibold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
