import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppHeader from '../components/AppHeader';
import {
  profilesAPI,
  settingsAPI,
  authAPI,
  documentsAPI,
  licensingSettingsAPI,
  membershipTierConfigsAPI,
  membershipsAPI,
  couponsAPI,
  jobAlertPreferencesAPI,
  feedbackAPI,
} from '../api/api';
import { auth } from '../auth';
import CardPaymentForm from '../components/CardPaymentForm';
import { getStripePublishableKey, isValidStripePublishableKey } from '../stripeConfig';
import JobAddressFields from '../components/JobAddressFields';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import SystemControlsPricing from '../components/admin/SystemControlsPricing';
import { needsTechnicianMapSetup } from '../utils/technicianMap';
import { requiresElectricalLicenseForState, setLocalOnlyLicenseStates } from '../utils/licensingRules';
import { formatPhoneInput } from '../utils/phone';
import { TRADE_OPTIONS, TRADE_OTHER_SENTINEL } from '../constants/trades';
import { getNotificationCategories } from '../config/notificationPreferenceCatalog';
import { parseSettingsUrl, replaceSettingsUrl } from '../utils/settingsUrl';
import SettingsPageShell from '../components/settings/SettingsPageShell';
import SettingsHeader from '../components/settings/SettingsHeader';
import SettingsTabs from '../components/settings/SettingsTabs';
import SettingsSection from '../components/settings/SettingsSection';
import SettingsCard from '../components/settings/SettingsCard';
import SettingsRow from '../components/settings/SettingsRow';
import SettingsToggle from '../components/settings/SettingsToggle';
import SettingsInput from '../components/settings/SettingsInput';
import SettingsDangerZone from '../components/settings/SettingsDangerZone';
import SettingsBadge from '../components/settings/SettingsBadge';
import NotificationPreferenceCard from '../components/settings/NotificationPreferenceCard';
import NotificationAdvancedModal from '../components/settings/NotificationAdvancedModal';

const formatMembershipTier = (tier) => {
  const raw = String(tier || '').trim();
  if (!raw) return 'Basic';
  return raw
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const DEFAULT_EMAIL_PREFS = {
  messages: true,
  job_lifecycle: true,
  reviews: true,
  membership_updates: true,
};

const MAX_DURATION_WEEKS = 12;

const clampDurationThumb = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_DURATION_WEEKS, Math.max(0, Math.round(n)));
};

const durationSummary = (minWeeks, maxWeeks) => {
  const hasMin = Number.isFinite(minWeeks);
  const hasMax = Number.isFinite(maxWeeks);
  if (!hasMin && !hasMax) return 'Any duration';
  if (!hasMin && hasMax) return maxWeeks >= MAX_DURATION_WEEKS ? 'Any duration' : `${maxWeeks} weeks or less`;
  if (hasMin && !hasMax) return minWeeks >= MAX_DURATION_WEEKS ? '12+ weeks' : `${minWeeks}+ weeks`;
  if (minWeeks === maxWeeks) return `${minWeeks} week${minWeeks === 1 ? '' : 's'}`;
  return `${minWeeks}-${maxWeeks} weeks`;
};

const SettingsPage = ({ user, onLogout, onUserUpdate }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({});
  const [paymentError, setPaymentError] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_notifications_enabled: true,
    job_alert_notifications_enabled: true,
    email_notification_preferences: DEFAULT_EMAIL_PREFS,
  });
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [jobAlertForm, setJobAlertForm] = useState({
    trade_label: '',
    min_hourly_rate_dollars: '0.00',
    max_distance_miles: 200,
    min_duration_weeks: null,
    max_duration_weeks: null,
    email_enabled: true,
    sms_enabled: true,
    app_enabled: true,
  });
  const [savingJobAlertForm, setSavingJobAlertForm] = useState(false);
  const [tradeQueryOpen, setTradeQueryOpen] = useState(false);
  const [tradeOtherNoteOpen, setTradeOtherNoteOpen] = useState(false);
  const [jobAlertTradeNote, setJobAlertTradeNote] = useState('');
  const [sendingTradeSuggestion, setSendingTradeSuggestion] = useState(false);
  const [tradeSuggestionSent, setTradeSuggestionSent] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [deletingCertId, setDeletingCertId] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' });
  const [confirmCertId, setConfirmCertId] = useState(null);
  const [settingsTab, setSettingsTab] = useState('account');
  const [adminSystemSubTab, setAdminSystemSubTab] = useState('pricing');
  const [modalNotificationItem, setModalNotificationItem] = useState(null);
  const [localAdvancedById, setLocalAdvancedById] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [membershipTierDetailList, setMembershipTierDetailList] = useState([]);
  const [membershipTierConfigsLoading, setMembershipTierConfigsLoading] = useState(false);
  const [membershipTierOptions, setMembershipTierOptions] = useState([]);
  const [membershipTierEditing, setMembershipTierEditing] = useState(false);
  const [membershipTierDraft, setMembershipTierDraft] = useState('');
  const [savingMembership, setSavingMembership] = useState(false);
  const publishableKey = getStripePublishableKey();
  const stripe = useMemo(() => {
    if (window.Stripe && isValidStripePublishableKey(publishableKey)) {
      return window.Stripe(publishableKey);
    }
    return null;
  }, [publishableKey]);

  const isCompany = user?.role === 'company';
  const isTechnician = user?.role === 'technician';
  const isAdmin = user?.role === 'admin';
  const needsMapSetup = isTechnician && needsTechnicianMapSetup(profile);

  const mainTabs = useMemo(() => {
    const base = [
      { id: 'account', label: 'Account' },
      { id: 'profile', label: 'Profile' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'payment', label: 'Billing' },
    ];
    if (isTechnician || isCompany) {
      base.push({ id: 'membership', label: 'Membership and access' });
      base.push({ id: 'legal', label: 'Legal and support' });
    } else if (isAdmin) {
      base.push({ id: 'legal', label: 'Legal and support' });
    }
    if (isAdmin) base.push({ id: 'system_controls', label: 'System controls' });
    return base;
  }, [isAdmin, isTechnician, isCompany]);

  const settingsSubtitle = useMemo(() => {
    if (isAdmin) {
      return 'Manage your account, marketplace controls, billing rules, notifications, and platform configuration.';
    }
    if (isCompany) {
      return 'Manage your company profile, billing, notifications, job preferences, and account security.';
    }
    if (isTechnician) {
      return 'Manage your profile, job alerts, notifications, membership, payment preferences, and account security.';
    }
    return 'Manage your TechFlash account.';
  }, [isAdmin, isCompany, isTechnician]);

  const roleBadgeLabel = useMemo(() => {
    if (isAdmin) return 'Admin';
    if (isCompany) return 'Company';
    if (isTechnician) return 'Technician';
    return 'User';
  }, [isAdmin, isCompany, isTechnician]);

  const accountStatusBadges = useMemo(() => {
    const badges = [];
    const ms = profile?.membership_status;
    if (ms && String(ms).toLowerCase() !== 'active') badges.push(String(ms).replace(/_/g, ' '));
    if (isTechnician && needsMapSetup) badges.push('Incomplete profile');
    if (isCompany && requiresElectricalLicenseForState(form.state) && !(form.electrical_license_number || '').trim()) {
      badges.push('Incomplete profile');
    }
    if (isTechnician && profile && !profile.background_verified) {
      badges.push('Pending verification');
    }
    if (!badges.length) badges.push('Active');
    return [...new Set(badges)];
  }, [profile, isTechnician, isCompany, form.state, form.electrical_license_number, needsMapSetup]);

  const profileCompletion = useMemo(() => {
    if (!profile || isAdmin) return { pct: 100, missing: [] };
    const missing = [];
    if (!(form.first_name || '').trim()) missing.push('First name');
    if (!(form.last_name || '').trim()) missing.push('Last name');
    const phoneDigits = String(form.phone || '').replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 10) missing.push('Phone');
    if (isCompany) {
      if (!(form.company_name || '').trim()) missing.push('Company name');
      if (!(form.location || '').trim()) missing.push('Location');
    }
    if (isTechnician) {
      if (!(form.trade_type || '').trim()) missing.push('Trade type');
      if (!(form.bio || '').trim()) missing.push('Bio');
      if (needsMapSetup) missing.push('Full address for maps');
    }
    const total = isCompany ? 7 : 8;
    const pct = Math.round(((total - missing.length) / total) * 100);
    return { pct: Math.min(100, Math.max(0, pct)), missing };
  }, [profile, isAdmin, isCompany, isTechnician, form, needsMapSetup]);

  const notificationCategories = useMemo(() => {
    const r = user?.role;
    if (r === 'admin') return getNotificationCategories('admin');
    if (r === 'company') return getNotificationCategories('company');
    return getNotificationCategories('technician');
  }, [user?.role]);

  const membershipTierSelectOptions = useMemo(() => {
    const cur = String(profile?.membership_level || '').toLowerCase();
    const opts = [...membershipTierOptions];
    if (cur && !opts.some((o) => o.id === cur)) {
      opts.push({ id: cur, name: formatMembershipTier(cur) });
    }
    return opts;
  }, [membershipTierOptions, profile?.membership_level]);

  const matchingTradeOptions = useMemo(() => {
    const query = (jobAlertForm.trade_label || '').trim().toLowerCase();
    if (!query) return TRADE_OPTIONS;
    return TRADE_OPTIONS.filter((opt) => opt.toLowerCase().includes(query));
  }, [jobAlertForm.trade_label]);

  const minDurationSlider = Number.isFinite(jobAlertForm.min_duration_weeks) ? jobAlertForm.min_duration_weeks : 0;
  const maxDurationSlider = Number.isFinite(jobAlertForm.max_duration_weeks) ? jobAlertForm.max_duration_weeks : MAX_DURATION_WEEKS;
  const minDurationPercent = (minDurationSlider / MAX_DURATION_WEEKS) * 100;
  const maxDurationPercent = (maxDurationSlider / MAX_DURATION_WEEKS) * 100;

  const fetchProfile = useCallback(async (opts = {}) => {
    const quiet = opts.quiet === true;
    if (!quiet) setLoading(true);
    setError(null);
    const nameFields = () => ({
      first_name: user?.first_name ?? auth.getUser()?.first_name ?? '',
      last_name: user?.last_name ?? auth.getUser()?.last_name ?? '',
    });
    const phoneFromUser = () => user?.phone ?? auth.getUser()?.phone ?? '';
    try {
      if (isCompany) {
        const p = await profilesAPI.getCompanyProfile();
        setProfile(p);
        setForm({
          ...nameFields(),
          phone: p?.phone ?? phoneFromUser(),
          company_name: p?.company_name || '',
          industry: p?.industry || '',
          location: p?.location || '',
          state: p?.state || '',
          electrical_license_number: p?.electrical_license_number || '',
          bio: p?.bio || '',
        });
        return p;
      }
      if (isTechnician) {
        const p = await profilesAPI.getTechnicianProfile();
        setProfile(p);
        setForm({
          ...nameFields(),
          phone: p?.phone ?? phoneFromUser(),
          trade_type: p?.trade_type || '',
          experience_years: p?.experience_years ?? '',
          availability: p?.availability || '',
          bio: p?.bio || '',
          location: p?.location || '',
          address: p?.address || '',
          city: p?.city || '',
          state: p?.state || 'Texas',
          zip_code: p?.zip_code || '',
          country: p?.country || 'United States',
        });
        return p;
      }
      setProfile(null);
      return null;
    } catch {
      setError('Failed to load profile');
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [isCompany, isTechnician, user?.first_name, user?.last_name, user?.phone]);

  useEffect(() => {
    let active = true;
    licensingSettingsAPI.get()
      .then((res) => {
        if (!active) return;
        setLocalOnlyLicenseStates(res?.local_only_state_codes || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (isTechnician && profile?.id) {
      documentsAPI.getAll()
        .then((docs) => {
          const certs = (docs || []).filter(
            (d) => d.doc_type === 'certificate' && d.uploadable_type === 'TechnicianProfile' && d.uploadable_id === profile.id
          );
          setCertificates(certs);
        })
        .catch(() => setCertificates([]));
    } else {
      setCertificates([]);
    }
  }, [isTechnician, profile?.id]);

  useEffect(() => {
    setAccountEmail(user?.email || auth.getUser()?.email || '');
  }, [user?.email]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      first_name: user?.first_name || auth.getUser()?.first_name || '',
      last_name: user?.last_name || auth.getUser()?.last_name || '',
      phone: user?.phone ?? auth.getUser()?.phone ?? prev.phone ?? '',
    }));
  }, [user?.first_name, user?.last_name, user?.phone]);

  useEffect(() => {
    setNotificationPrefs({
      email_notifications_enabled: user?.email_notifications_enabled !== false,
      job_alert_notifications_enabled: user?.job_alert_notifications_enabled !== false,
      email_notification_preferences: {
        ...DEFAULT_EMAIL_PREFS,
        ...(user?.email_notification_preferences || {}),
      },
    });
  }, [user?.email_notifications_enabled, user?.job_alert_notifications_enabled, user?.email_notification_preferences]);

  useEffect(() => {
    if (!isTechnician) return undefined;
    let cancelled = false;
    jobAlertPreferencesAPI
      .get()
      .then((res) => {
        if (cancelled) return;
        const j = res?.job_alert_preference;
        if (!j) return;
        setJobAlertForm({
          trade_label: j.trade_label ?? '',
          min_hourly_rate_dollars: ((Number(j.min_hourly_rate_cents) || 0) / 100).toFixed(2),
          max_distance_miles: j.max_distance_miles ?? 200,
          min_duration_weeks: Number.isFinite(j.min_duration_weeks) ? j.min_duration_weeks : null,
          max_duration_weeks: Number.isFinite(j.max_duration_weeks) ? j.max_duration_weeks : null,
          email_enabled: j.email_enabled !== false,
          sms_enabled: j.sms_enabled !== false,
          app_enabled: j.app_enabled !== false,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isTechnician]);

  useEffect(() => {
    if (!isTechnician && !isCompany) return undefined;
    let cancelled = false;
    membershipTierConfigsAPI
      .list(isCompany ? 'company' : 'technician')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.membership_tier_configs) ? res.membership_tier_configs : [];
        const mapped = list
          .map((t) => ({
            id: String(t.slug || '').toLowerCase(),
            name: t.display_name || t.slug || '',
          }))
          .filter((t) => t.id);
        setMembershipTierOptions(
          mapped.length > 0
            ? mapped
            : [
                { id: 'basic', name: 'Basic' },
                { id: 'pro', name: 'Pro' },
                { id: 'premium', name: 'Premium' },
              ]
        );
      })
      .catch(() => {
        if (!cancelled) {
          setMembershipTierOptions([
            { id: 'basic', name: 'Basic' },
            { id: 'pro', name: 'Pro' },
            { id: 'premium', name: 'Premium' },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isTechnician, isCompany]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const membershipParam = params.get('membership');
    if (membershipParam === 'success' || membershipParam === 'cancel') {
      setSettingsTab('profile');
      const path = window.location.pathname || '/settings';
      window.history.replaceState({}, '', path);
      if (membershipParam === 'success') {
        fetchProfile({ quiet: true }).then((p) => {
          if (p && user && onUserUpdate) {
            onUserUpdate({
              ...user,
              membership_level: p.membership_level ?? user.membership_level,
            });
          }
          setAlertModal({
            isOpen: true,
            title: 'Welcome back',
            message:
              'If checkout completed, your new tier should appear above. If not, refresh the page in a few seconds.',
            variant: 'success',
          });
        });
      }
      return;
    }

    const { tab, sub } = parseSettingsUrl();
    const allowed = new Set(mainTabs.map((t) => t.id));
    if (allowed.has(tab)) setSettingsTab(tab);
    if (isAdmin && tab === 'system_controls' && sub) setAdminSystemSubTab(sub);
  }, [fetchProfile, user, onUserUpdate, isAdmin, mainTabs]);

  useEffect(() => {
    replaceSettingsUrl(settingsTab, isAdmin && settingsTab === 'system_controls' ? adminSystemSubTab : null);
  }, [settingsTab, adminSystemSubTab, isAdmin]);

  useEffect(() => {
    if (settingsTab !== 'membership' || (!isTechnician && !isCompany)) return undefined;
    let cancelled = false;
    setMembershipTierConfigsLoading(true);
    membershipTierConfigsAPI
      .list(isCompany ? 'company' : 'technician')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.membership_tier_configs) ? res.membership_tier_configs : [];
        setMembershipTierDetailList(list);
      })
      .catch(() => {
        if (!cancelled) setMembershipTierDetailList([]);
      })
      .finally(() => {
        if (!cancelled) setMembershipTierConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsTab, isTechnician, isCompany]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const patchAddress = (patch) => {
    setForm((prev) => ({
      ...prev,
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.city !== undefined ? { city: patch.city } : {}),
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.zip_code !== undefined ? { zip_code: patch.zip_code } : {}),
      ...(patch.country !== undefined ? { country: patch.country } : {}),
    }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    const firstName = (form.first_name || '').trim();
    const lastName = (form.last_name || '').trim();
    const phoneDigits = String(form.phone || '').replace(/\D/g, '');
    if (!firstName || !lastName) {
      setError('First name and last name are required.');
      return;
    }
    if (!phoneDigits || phoneDigits.length < 10) {
      setError('A valid phone number is required (10 digits).');
      return;
    }

    if (!isAdmin && !profile?.id) return;
    setSaving(true);
    setError(null);
    try {
      const phoneTrim = String(form.phone || '').trim();
      const accountRes = await authAPI.updateMe({
        first_name: firstName,
        last_name: lastName,
        phone: phoneTrim,
      });
      auth.setUser(accountRes.user);
      onUserUpdate?.(accountRes.user);

      if (isCompany) {
        const companyState = (form.state || '').trim();
        const stateRequiresLicense = requiresElectricalLicenseForState(companyState);
        if (stateRequiresLicense && !(form.electrical_license_number || '').trim()) {
          setError('This state requires an electrical license number.');
          setSaving(false);
          return;
        }
        const { first_name: _fn, last_name: _ln, ...companyPayload } = form;
        await profilesAPI.updateCompanyProfile(profile.id, {
          ...companyPayload,
          state: companyState,
          electrical_license_number: (form.electrical_license_number || '').trim(),
        });
      } else if (isTechnician) {
        const { first_name: _fn2, last_name: _ln2, ...techPayload } = form;
        await profilesAPI.updateTechnicianProfile(profile.id, {
          ...techPayload,
          experience_years: form.experience_years === '' ? null : parseInt(form.experience_years, 10),
        });
      }
      await fetchProfile();
      setAlertModal({ isOpen: true, title: 'Profile saved!', message: 'Your profile has been updated.', variant: 'success' });
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    const email = accountEmail.trim();
    if (!email) return;
    if (accountPassword && accountPassword !== accountPasswordConfirm) {
      setAccountError('Passwords do not match');
      return;
    }
    setSavingAccount(true);
    setAccountError(null);
    try {
      const payload = { email };
      if (accountPassword) {
        payload.password = accountPassword;
        payload.password_confirmation = accountPasswordConfirm;
      }
      const res = await authAPI.updateMe(payload);
      auth.setUser(res.user);
      onUserUpdate?.(res.user);
      setAccountPassword('');
      setAccountPasswordConfirm('');
      setAlertModal({
        isOpen: true,
        title: 'Account updated',
        message: email !== (user?.email || auth.getUser()?.email) ? 'Email updated. Use your new email to log in next time.' : 'Your account has been updated.',
        variant: 'success',
      });
    } catch (err) {
      setAccountError(err.message || 'Failed to update account');
    } finally {
      setSavingAccount(false);
    }
  };

  const persistNotificationPrefs = async (next) => {
    setSavingNotifications(true);
    try {
      const payload = {
        email_notifications_enabled: next.email_notifications_enabled,
        job_alert_notifications_enabled: next.job_alert_notifications_enabled,
        email_notification_preferences: next.email_notification_preferences,
      };
      const res = await authAPI.updateMe(payload);
      auth.setUser(res.user);
      onUserUpdate?.(res.user);
      setAlertModal({
        isOpen: true,
        title: 'Preferences saved',
        message: 'Notification settings updated.',
        variant: 'success',
      });
      return true;
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Update failed',
        message: err.message || 'Could not save notification settings.',
        variant: 'error',
      });
      return false;
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleNotificationToggle = async (key, value) => {
    const prev = notificationPrefs;
    const next = { ...prev, [key]: value };
    setNotificationPrefs(next);
    const ok = await persistNotificationPrefs(next);
    if (!ok) {
      setNotificationPrefs(prev);
    }
  };

  const handleNotificationCardToggle = async (item, value) => {
    if (item.persistence === 'job_alert_master') {
      await handleNotificationToggle('job_alert_notifications_enabled', value);
      return;
    }
    if (item.persistence === 'user_email_category' && item.emailCategory) {
      let next = { ...notificationPrefs };
      if (value && next.email_notifications_enabled === false) {
        next = { ...next, email_notifications_enabled: true };
      }
      next = {
        ...next,
        email_notification_preferences: {
          ...next.email_notification_preferences,
          [item.emailCategory]: value,
        },
      };
      const prev = notificationPrefs;
      setNotificationPrefs(next);
      const ok = await persistNotificationPrefs(next);
      if (!ok) setNotificationPrefs(prev);
    }
  };

  const handlePersistModalNotificationPrefs = async (draft) => {
    setSavingNotifications(true);
    try {
      const res = await authAPI.updateMe({
        email_notifications_enabled: draft.email_notifications_enabled,
        job_alert_notifications_enabled: draft.job_alert_notifications_enabled,
        email_notification_preferences: draft.email_notification_preferences,
      });
      auth.setUser(res.user);
      onUserUpdate?.(res.user);
      setNotificationPrefs({
        email_notifications_enabled: res.user.email_notifications_enabled !== false,
        job_alert_notifications_enabled: res.user.job_alert_notifications_enabled !== false,
        email_notification_preferences: {
          ...DEFAULT_EMAIL_PREFS,
          ...(res.user.email_notification_preferences || {}),
        },
      });
      setAlertModal({
        isOpen: true,
        title: 'Preferences saved',
        message: 'Notification settings updated.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Update failed',
        message: err.message || 'Could not save notification settings.',
        variant: 'error',
      });
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleDeleteAccountConfirmed = async () => {
    await authAPI.deleteMe();
    onLogout?.();
  };

  const handleJobAlertFieldChange = (e) => {
    const { name, value, checked } = e.target;
    const boolKeys = ['email_enabled', 'sms_enabled', 'app_enabled'];
    if (boolKeys.includes(name)) {
      setJobAlertForm((prev) => ({ ...prev, [name]: checked }));
      return;
    }
    if (name === 'min_hourly_rate_dollars') {
      const normalized = value.replace(/[^0-9.]/g, '');
      if (normalized.includes('.')) {
        const [left, right] = normalized.split('.');
        setJobAlertForm((prev) => ({ ...prev, min_hourly_rate_dollars: `${left}.${(right || '').slice(0, 2)}` }));
      } else {
        setJobAlertForm((prev) => ({ ...prev, min_hourly_rate_dollars: normalized }));
      }
      return;
    }
    const numKeys = ['max_distance_miles'];
    if (numKeys.includes(name)) {
      if (value === '') {
        setJobAlertForm((prev) => ({ ...prev, [name]: '' }));
        return;
      }
      const n = Number(value);
      setJobAlertForm((prev) => ({ ...prev, [name]: Number.isFinite(n) ? n : prev[name] }));
      return;
    }
    setJobAlertForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleDurationMinChange = (value) => {
    const nextMin = clampDurationThumb(value);
    const nextMax = Math.max(nextMin, maxDurationSlider);
    setJobAlertForm((prev) => ({
      ...prev,
      min_duration_weeks: nextMin === 0 ? null : nextMin,
      max_duration_weeks: nextMax >= MAX_DURATION_WEEKS ? null : nextMax,
    }));
  };

  const handleDurationMaxChange = (value) => {
    const nextMax = clampDurationThumb(value);
    const nextMin = Math.min(minDurationSlider, nextMax);
    setJobAlertForm((prev) => ({
      ...prev,
      min_duration_weeks: nextMin === 0 ? null : nextMin,
      max_duration_weeks: nextMax >= MAX_DURATION_WEEKS ? null : nextMax,
    }));
  };

  const handlePickTrade = (label) => {
    setTradeSuggestionSent(false);
    if (label === TRADE_OTHER_SENTINEL) {
      setTradeQueryOpen(true);
      setTradeOtherNoteOpen(true);
      return;
    }
    setTradeOtherNoteOpen(false);
    setTradeQueryOpen(false);
    setJobAlertForm((prev) => ({ ...prev, trade_label: label }));
  };

  const handleSendTradeSuggestion = async () => {
    const typed = (jobAlertForm.trade_label || '').trim();
    const note = jobAlertTradeNote.trim();
    if (!typed || !note) return;
    setSendingTradeSuggestion(true);
    try {
      await feedbackAPI.create({
        kind: 'suggestion',
        body: `Trade suggestion from Job alert matching:\nTyped: "${typed}"\nNote: ${note}`,
        page_path: '/settings',
      });
      setTradeSuggestionSent(true);
      setJobAlertTradeNote('');
      setTradeQueryOpen(false);
      setTradeOtherNoteOpen(false);
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not send suggestion',
        message: err.message || 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSendingTradeSuggestion(false);
    }
  };

  const handleSaveJobAlertPreferences = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setSavingJobAlertForm(true);
    try {
      const md = jobAlertForm.max_distance_miles === '' ? NaN : Number(jobAlertForm.max_distance_miles);
      const dollars = parseFloat(jobAlertForm.min_hourly_rate_dollars || '0');
      const payload = {
        trade_label: (jobAlertForm.trade_label || '').trim(),
        min_hourly_rate_cents: Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0,
        max_distance_miles: Number.isFinite(md) && md > 0 ? md : 1,
        min_duration_weeks: Number.isFinite(jobAlertForm.min_duration_weeks) ? jobAlertForm.min_duration_weeks : null,
        max_duration_weeks: Number.isFinite(jobAlertForm.max_duration_weeks) ? jobAlertForm.max_duration_weeks : null,
        email_enabled: !!jobAlertForm.email_enabled,
        sms_enabled: !!jobAlertForm.sms_enabled,
        app_enabled: !!jobAlertForm.app_enabled,
      };
      await jobAlertPreferencesAPI.update(payload);
      setAlertModal({
        isOpen: true,
        title: 'Saved',
        message: 'Job alert preferences updated.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not save',
        message: err.message || 'Could not update job alert preferences.',
        variant: 'error',
      });
    } finally {
      setSavingJobAlertForm(false);
    }
  };

  const handleRedeemCoupon = async (e) => {
    e.preventDefault();
    const code = couponCode.trim();
    if (!code) return;
    setCouponBusy(true);
    try {
      await couponsAPI.redeem(code);
      setCouponCode('');
      setAlertModal({
        isOpen: true,
        title: 'Coupon applied',
        message: 'Your promo code has been linked to your account.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not redeem',
        message: err.message || 'Invalid or inactive code.',
        variant: 'error',
      });
    } finally {
      setCouponBusy(false);
    }
  };

  const handleCertificateUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setUploadingCert(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('uploadable_type', 'TechnicianProfile');
      fd.append('uploadable_id', profile.id);
      fd.append('doc_type', 'certificate');
      await documentsAPI.upload(fd);
      const docs = await documentsAPI.getAll();
      setCertificates((docs || []).filter(
        (d) => d.doc_type === 'certificate' && d.uploadable_type === 'TechnicianProfile' && d.uploadable_id === profile.id
      ));
      setAlertModal({ isOpen: true, title: 'Certificate uploaded!', message: 'Your certificate has been added.', variant: 'success' });
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Upload failed', message: err.message || 'Failed to upload certificate', variant: 'error' });
    } finally {
      setUploadingCert(false);
      e.target.value = '';
    }
  };

  const handleCertificateDelete = (docId) => {
    setConfirmCertId(docId);
  };

  const confirmCertificateDelete = async () => {
    const docId = confirmCertId;
    setConfirmCertId(null);
    if (!docId) return;
    setDeletingCertId(docId);
    try {
      await documentsAPI.delete(docId);
      setCertificates((prev) => prev.filter((d) => d.id !== docId));
      setAlertModal({ isOpen: true, title: 'Certificate removed', message: 'The certificate has been deleted.', variant: 'success' });
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Remove failed', message: err.message || 'Failed to remove certificate', variant: 'error' });
    } finally {
      setDeletingCertId(null);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      if (isCompany) {
        await profilesAPI.updateCompanyProfile(profile.id, fd);
      } else {
        await profilesAPI.updateTechnicianProfile(profile.id, fd);
      }
      await fetchProfile();
      setAlertModal({ isOpen: true, title: 'Photo updated!', message: 'Your profile photo has been updated.', variant: 'success' });
    } catch (err) {
      setError(err.message || 'Failed to upload photo');
    } finally {
      setSaving(false);
    }
  };

  const beginMembershipTierEdit = () => {
    const raw = profile?.membership_level ?? user?.membership_level ?? 'basic';
    setMembershipTierDraft(String(raw).toLowerCase());
    setMembershipTierEditing(true);
  };

  const cancelMembershipTierEdit = () => {
    setMembershipTierEditing(false);
  };

  const handleMembershipTierSave = async () => {
    const level = String(membershipTierDraft || '').toLowerCase();
    if (!level) return;
    setSavingMembership(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await membershipsAPI.update({
        membership_level: level,
        success_url: `${origin}/settings?tab=profile&membership=success`,
        cancel_url: `${origin}/settings?tab=profile&membership=cancel`,
      });
      const checkoutUrl = res?.checkout?.url;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      const updatedProfile = await fetchProfile({ quiet: true });
      if (updatedProfile && user && onUserUpdate) {
        onUserUpdate({
          ...user,
          membership_level: updatedProfile.membership_level ?? user.membership_level,
        });
      }
      setMembershipTierEditing(false);
      setAlertModal({
        isOpen: true,
        title: 'Membership updated',
        message: 'Your membership tier has been updated.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not update membership',
        message: err.message || 'Try again later.',
        variant: 'error',
      });
    } finally {
      setSavingMembership(false);
    }
  };

  const handleAddCardConfirm = async ({ card, billing_details }) => {
    setPaymentError(null);
    setPaymentSuccess(null);
    const res = await settingsAPI.createSetupIntent();
    const client_secret = res?.client_secret;
    if (!client_secret) throw new Error(res?.error || 'Could not create setup');
    if (!stripe) throw new Error('Payment form not ready');
    const { error: confirmError } = await stripe.confirmCardSetup(client_secret, {
      payment_method: { card, billing_details },
    });
    if (confirmError) throw new Error(confirmError.message);
    setPaymentSuccess('Payment method added successfully.');
  };

  const handleConnectBank = async () => {
    setPaymentError(null);
    setPaymentSuccess(null);
    try {
      const { url } = await settingsAPI.createConnectAccountLink();
      if (url) window.location.href = url;
      else throw new Error('No link received');
    } catch (err) {
      setPaymentError(err.message || 'Failed to start bank setup');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={onLogout} activePage="settings" emailVariant="simple" />
      <SettingsPageShell wide={isAdmin && settingsTab === 'system_controls'}>
        <SettingsHeader
          title="Settings"
          subtitle={settingsSubtitle}
          roleBadge={roleBadgeLabel}
          statusBadges={accountStatusBadges}
          lastSavedAt={user?.updated_at}
          note="Changes save per section. Use each section's save or update control."
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">{error}</div>
        )}

        <section
          className="bg-white rounded-2xl shadow border border-gray-200 overflow-x-hidden"
          aria-label="Settings sections"
        >
          <SettingsTabs tabs={mainTabs} activeId={settingsTab} onChange={setSettingsTab} />

          <div className="p-4 sm:p-6">
            {settingsTab === 'account' && (
              <div id="settings-panel-account" role="tabpanel" aria-labelledby="settings-tab-account">
                <SettingsSection
                  title="Sign-in and email"
                  description="Your email is your username. Security-critical messages always stay on."
                />
                <SettingsCard title="Account role" collapsible defaultOpen={false}>
                  <SettingsRow
                    title="Role"
                    description="Determines marketplace permissions and available settings tabs."
                    control={<span className="text-sm font-medium text-gray-800">{roleBadgeLabel}</span>}
                  />
                </SettingsCard>
                {accountError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{accountError}</div>
                )}
                <form onSubmit={handleAccountSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email (username)</label>
                    <SettingsInput
                      type="email"
                      value={accountEmail}
                      onChange={(e) => setAccountEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-sm font-medium text-gray-700">New password (optional)</label>
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-700 hover:underline"
                        onClick={() => setShowPassword((s) => !s)}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <SettingsInput
                      type={showPassword ? 'text' : 'password'}
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-sm font-medium text-gray-700">Confirm new password</label>
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-700 hover:underline"
                        onClick={() => setShowPasswordConfirm((s) => !s)}
                      >
                        {showPasswordConfirm ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <SettingsInput
                      type={showPasswordConfirm ? 'text' : 'password'}
                      value={accountPasswordConfirm}
                      onChange={(e) => setAccountPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Confirm new password"
                    />
                  </div>
                  <button type="submit" disabled={savingAccount} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                    {savingAccount ? 'Saving...' : 'Update account'}
                  </button>
                </form>

                <SettingsCard title="Two-factor authentication" description="Add an extra layer of protection for your TechFlash account." collapsible defaultOpen={false}>
                  <p className="text-sm text-gray-600">Not available yet. TODO(backend): TOTP or WebAuthn enrollment and recovery codes.</p>
                </SettingsCard>
                <SettingsCard title="Active sessions and devices" collapsible defaultOpen={false}>
                  <p className="text-sm text-gray-600">Session listing is not wired for this build. TODO(backend): GET /sessions for device/IP and remote sign-out.</p>
                </SettingsCard>
                <SettingsCard title="Login history" collapsible defaultOpen={false}>
                  <p className="text-sm text-gray-600">Recent sign-ins will appear here when audit logging is exposed to the app.</p>
                </SettingsCard>

                <SettingsDangerZone
                  title="Delete account"
                  description="This permanently removes your account and cannot be undone."
                >
                  <button
                    type="button"
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700"
                    onClick={() => setConfirmDeleteAccount(true)}
                  >
                    Delete account permanently
                  </button>
                </SettingsDangerZone>
              </div>
            )}

            {settingsTab === 'profile' && (
              <div id="settings-panel-profile" role="tabpanel" aria-labelledby="settings-tab-profile">
          {needsMapSetup && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Complete map setup</p>
              <p className="text-sm text-amber-800 mt-1">
                Add your full address so job maps can center correctly and show accurate nearby jobs.
              </p>
            </div>
          )}
          {(isTechnician || isCompany) && (
            <div className="grid gap-4 mb-6 md:grid-cols-2">
              <SettingsCard title="Profile completion" description="Based on fields on this page only.">
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-bold text-gray-900">{profileCompletion.pct}%</p>
                  <p className="text-sm text-gray-600 pb-1">complete</p>
                </div>
                {profileCompletion.missing.length > 0 ? (
                  <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 space-y-1">
                    {profileCompletion.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-emerald-800">Great — no obvious gaps from this checklist.</p>
                )}
              </SettingsCard>
              {isTechnician && (
                <SettingsCard title="Trust and verification" collapsible defaultOpen>
                  <ul className="text-sm text-gray-700 space-y-2">
                    <li>Background check: {profile?.background_verified ? 'Verified' : 'Not verified yet'}</li>
                    <li>Certificates on file: {certificates.length}</li>
                    <li>Map address: {needsMapSetup ? 'Incomplete' : 'Looks good'}</li>
                  </ul>
                </SettingsCard>
              )}
            </div>
          )}
          {isAdmin ? (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <p className="text-gray-500">Admin accounts do not have technician or company profiles, but you can update your name here.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                  <input
                    name="first_name"
                    value={form.first_name || ''}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                  <input
                    name="last_name"
                    value={form.last_name || ''}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                <input
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  value={form.phone || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: formatPhoneInput(e.target.value) }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="+1 (555) 555-0100"
                  required
                />
              </div>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="relative">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-2 border-gray-200" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl text-gray-500 font-bold">
                    {(form.first_name || user?.first_name || user?.email || '?')[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <label className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-2 cursor-pointer hover:bg-blue-700">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                </label>
              </div>
              <div className="text-sm text-gray-500">Click to change photo</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                <input
                  name="first_name"
                  value={form.first_name || ''}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                <input
                  name="last_name"
                  value={form.last_name || ''}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                value={form.phone || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: formatPhoneInput(e.target.value) }))}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="+1 (555) 555-0100"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Required. Used for job-related contact and your public profile.</p>
            </div>

            {isCompany && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
                  <input name="company_name" value={form.company_name} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input name="industry" value={form.industry} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Construction, HVAC" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input name="location" value={form.location} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    name="state"
                    value={form.state || ''}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g. Texas"
                  />
                </div>
                {requiresElectricalLicenseForState(form.state) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Electrical license number</label>
                    <input
                      name="electrical_license_number"
                      value={form.electrical_license_number || ''}
                      onChange={handleChange}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="Enter TECL license number"
                      required
                    />
                  </div>
                )}
              </>
            )}

            {isTechnician && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Trade type</label>
                    <select
                      name="trade_type"
                      value={form.trade_type || ''}
                      onChange={handleChange}
                      className="w-full border rounded-lg px-3 py-2 bg-white"
                      required
                    >
                      <option value="">Select trade type</option>
                      {TRADE_OPTIONS.map((trade) => (
                        <option key={trade} value={trade}>
                          {trade}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Years of experience</label>
                    <input type="number" min="0" name="experience_years" value={form.experience_years} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Availability</label>
                    <input name="availability" value={form.availability} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Full-time, Part-time" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                  <textarea
                    name="bio"
                    value={form.bio || ''}
                    onChange={handleChange}
                    rows={4}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Tell others about yourself..."
                  />
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h4 className="font-medium text-gray-900">Home address</h4>
                    {needsMapSetup && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Complete map setup
                      </span>
                    )}
                  </div>
                  <JobAddressFields
                    sectionTitle="Technician Address"
                    address={form.address}
                    city={form.city}
                    state={form.state}
                    zipCode={form.zip_code}
                    country={form.country}
                    onChange={patchAddress}
                  />
                  {needsMapSetup && (
                    <p className="mt-2 text-xs text-amber-800">
                      Required to enable accurate map radius and distance sorting on your dashboard.
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Certificates</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Upload images of your certifications (e.g. OSHA, EPA, trade licenses). Companies will verify these match their job requirements.
                  </p>
                  <div className="flex flex-wrap gap-4 mb-4">
                    {certificates.map((doc) => (
                      <div key={doc.id} className="relative group border rounded-lg overflow-hidden bg-gray-50 w-32 h-32">
                        {doc.file_url && (
                          <img src={doc.file_url} alt="Certificate" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => handleCertificateDelete(doc.id)}
                          disabled={deletingCertId === doc.id}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    <label className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                      <input type="file" accept="image/*" className="hidden" onChange={handleCertificateUpload} disabled={uploadingCert} />
                      {uploadingCert ? (
                        <span className="text-sm text-gray-500">Uploading...</span>
                      ) : (
                        <span className="text-3xl text-gray-400">+</span>
                      )}
                    </label>
                  </div>
                </div>
              </>
            )}

            {isCompany && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea
                  name="bio"
                  value={form.bio || ''}
                  onChange={handleChange}
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Tell others about your company..."
                />
              </div>
            )}

            <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
          )}
              </div>
            )}

            {settingsTab === 'payment' && (
              <div
                id="settings-panel-payment"
                role="tabpanel"
                aria-labelledby="settings-tab-payment"
                className="overflow-visible"
              >
          {paymentError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{paymentError}</div>}
          {paymentSuccess && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{paymentSuccess}</div>}

          {!isAdmin && (isTechnician || isCompany) && (
            <SettingsCard title="Promo code" description="Redeem a membership or billing promotion when applicable." collapsible defaultOpen={false}>
              <form onSubmit={handleRedeemCoupon} className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1 min-w-0">
                  <label htmlFor="settings-coupon-code" className="sr-only">
                    Promo code
                  </label>
                  <SettingsInput
                    id="settings-coupon-code"
                    type="text"
                    autoComplete="off"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Enter code"
                    disabled={couponBusy}
                  />
                </div>
                <button
                  type="submit"
                  disabled={couponBusy || !couponCode.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  {couponBusy ? 'Applying…' : 'Apply'}
                </button>
              </form>
            </SettingsCard>
          )}

          {isCompany && (
            <div>
              <h3 className="text-base font-medium text-gray-900 mb-2">Credit card</h3>
              <p className="text-gray-600 mb-4">Add a credit or debit card to pay for jobs when you accept technicians.</p>
              {!isValidStripePublishableKey(publishableKey) && (
                <p className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Stripe is not configured for this build. Set <code className="font-mono text-xs">VITE_STRIPE_PUBLISHABLE_KEY_TEST</code> or{' '}
                  <code className="font-mono text-xs">VITE_STRIPE_PUBLISHABLE_KEY</code> in your frontend <code className="font-mono text-xs">.env</code> (must start with{' '}
                  <code className="font-mono text-xs">pk_</code>).
                </p>
              )}
              <CardPaymentForm
                stripe={stripe}
                publishableKey={publishableKey}
                onConfirm={handleAddCardConfirm}
                submitLabel="Add Card"
              />
            </div>
          )}

          {isTechnician && (
            <div>
              <p className="text-gray-600 mb-4">
                Connect your bank account to receive payouts when jobs are completed.
                {profile?.stripe_connected && <span className="text-green-600 font-medium ml-2">✓ Connected</span>}
              </p>
              <button
                onClick={handleConnectBank}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                {profile?.stripe_connected ? 'Update Bank Account' : 'Connect Bank Account'}
              </button>
            </div>
          )}

          {(isAdmin || (!isCompany && !isTechnician)) && (
            <p className="text-gray-500">Payment settings are available for companies and technicians.</p>
          )}

          {!isAdmin && isCompany && (
            <SettingsCard title="Billing history" collapsible defaultOpen={false}>
              <p className="text-sm text-gray-600">Invoice and receipt history will appear here when billing exports are connected.</p>
            </SettingsCard>
          )}
              </div>
            )}

            {settingsTab === 'membership' && (isTechnician || isCompany) && (
              <div id="settings-panel-membership" role="tabpanel" aria-labelledby="settings-tab-membership" className="space-y-6">
                <SettingsSection
                  title="Membership and job access"
                  description="Your tier controls when jobs unlock for you and the platform commission rate."
                />
                <SettingsCard title="Current membership">
                  <div className="relative rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                    {!membershipTierEditing && (
                      <button
                        type="button"
                        onClick={beginMembershipTierEdit}
                        className="absolute top-3 right-3 text-sm font-medium text-blue-700 hover:text-blue-900"
                      >
                        Change tier
                      </button>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Membership tier</p>
                    {!membershipTierEditing ? (
                      <p className="mt-1 text-lg font-semibold text-blue-900 pr-20">{formatMembershipTier(profile?.membership_level)}</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <select
                          value={membershipTierDraft}
                          onChange={(e) => setMembershipTierDraft(e.target.value)}
                          className="w-full max-w-md border rounded-lg px-3 py-2 text-sm bg-white"
                          disabled={savingMembership}
                        >
                          {membershipTierSelectOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleMembershipTierSave}
                            disabled={savingMembership}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingMembership ? 'Saving...' : 'Continue'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelMembershipTierEdit}
                            disabled={savingMembership}
                            className="px-4 py-2 border border-gray-300 text-sm rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {profile?.membership_status && (
                      <p className="mt-2 text-xs text-blue-800">
                        Status: <span className="font-medium">{String(profile.membership_status)}</span>
                        {profile?.membership_current_period_end_at && (
                          <>
                            {' '}
                            · Renews{' '}
                            <time dateTime={profile.membership_current_period_end_at}>
                              {new Date(profile.membership_current_period_end_at).toLocaleDateString()}
                            </time>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </SettingsCard>

                <SettingsCard title="Tier access timing" collapsible defaultOpen>
                  {membershipTierConfigsLoading ? (
                    <p className="text-sm text-gray-500">Loading tier configuration…</p>
                  ) : membershipTierDetailList.length === 0 ? (
                    <p className="text-sm text-gray-600">No public tier timing is published yet.</p>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                          <tr>
                            <th className="px-3 py-2 font-medium">Tier</th>
                            <th className="px-3 py-2 font-medium">Monthly fee</th>
                            <th className="px-3 py-2 font-medium">Commission</th>
                            {isTechnician && <th className="px-3 py-2 font-medium">Job access delay</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {membershipTierDetailList.map((t) => (
                            <tr key={t.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-medium text-gray-900">{t.display_name || t.slug}</td>
                              <td className="px-3 py-2">${((t.monthly_fee_cents || 0) / 100).toFixed(2)}</td>
                              <td className="px-3 py-2">{t.commission_percent ?? '—'}%</td>
                              {isTechnician && (
                                <td className="px-3 py-2">
                                  {Number(t.early_access_delay_hours) === 0
                                    ? 'Immediate'
                                    : `${t.early_access_delay_hours}h after go-live`}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-gray-500">
                    Premium typically sees jobs immediately; Pro and Basic follow configured delays.
                  </p>
                </SettingsCard>
              </div>
            )}

            {settingsTab === 'legal' && (
              <div id="settings-panel-legal" role="tabpanel" aria-labelledby="settings-tab-legal" className="space-y-4">
                <SettingsSection title="Legal and support" description="Policies and ways to reach the TechFlash team." />
                <SettingsCard title="Policies">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <a className="text-blue-700 font-medium hover:underline" href="/privacy-policy">
                      Privacy Policy
                    </a>
                    <a className="text-blue-700 font-medium hover:underline" href="/terms-of-service">
                      Terms of Service
                    </a>
                  </div>
                </SettingsCard>
                <SettingsCard title="Help">
                  <p className="text-sm text-gray-600 mb-3">Questions about billing, jobs, or your account?</p>
                  <a className="inline-flex text-sm font-medium text-orange-600 hover:underline" href="mailto:support@techflash.app">
                    support@techflash.app
                  </a>
                </SettingsCard>
              </div>
            )}

            {settingsTab === 'notifications' && (
              <div
                id="settings-panel-notifications"
                role="tabpanel"
                aria-labelledby="settings-tab-notifications"
                className="space-y-6"
              >
                <SettingsSection
                  title="Notification center"
                  description="Choose what we email you about. Security, password reset, payment receipts, and legal notices stay on."
                />

                <SettingsCard title="Always on (cannot disable)" collapsible defaultOpen={false}>
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                    <li>Security alerts and password reset</li>
                    <li>Payment receipts and tax or compliance notices when applicable</li>
                    <li>Legal and policy updates when required</li>
                  </ul>
                </SettingsCard>

                <SettingsCard title="Global email controls">
                  <p className="text-sm text-gray-600 mb-4">
                    Master switch for non-critical automated emails. Individual categories can still be tuned per row below.
                  </p>
                  <SettingsRow
                    title="All automated non-critical emails"
                    description="Turns off optional marketing and lifecycle digests except security and receipts."
                    control={
                      <SettingsToggle
                        checked={notificationPrefs.email_notifications_enabled !== false}
                        disabled={savingNotifications}
                        onChange={(v) => handleNotificationToggle('email_notifications_enabled', v)}
                        ariaLabel="All non-critical emails"
                      />
                    }
                  />
                </SettingsCard>

                <SettingsCard title="Digest, quiet hours, and language" collapsible defaultOpen={false}>
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    Not connected to the backend yet. TODO(backend): user notification_settings JSON for digest and quiet hours.
                  </p>
                  <p className="text-sm text-gray-600">UI placeholder for hourly/daily digests, time zone, and preferred language.</p>
                </SettingsCard>

                <div className="grid gap-4 md:grid-cols-2">
                  {notificationCategories.map((item) => (
                    <NotificationPreferenceCard
                      key={item.id}
                      item={item}
                      notificationPrefs={notificationPrefs}
                      jobAlertForm={jobAlertForm}
                      isTechnician={isTechnician}
                      savingNotifications={savingNotifications}
                      savingJobAlertForm={savingJobAlertForm}
                      onTogglePersisted={(it, v) => handleNotificationCardToggle(it, v)}
                      onCustomize={(it) => setModalNotificationItem(it)}
                    />
                  ))}
                </div>

                {isTechnician && (
                  <SettingsCard
                    title="Job alert filters"
                    description="Trade, pay floor, distance, duration, and channels for nearby jobs."
                    collapsible
                    defaultOpen={false}
                  >
                    <form onSubmit={handleSaveJobAlertPreferences} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <label htmlFor="job-alert-trade" className="block text-xs font-medium text-gray-700 mb-1">
                            Trade / role label (optional)
                          </label>
                          <input
                            id="job-alert-trade"
                            name="trade_label"
                            value={jobAlertForm.trade_label}
                            onChange={(e) => {
                              setTradeSuggestionSent(false);
                              setTradeOtherNoteOpen(false);
                              handleJobAlertFieldChange(e);
                              setTradeQueryOpen(true);
                            }}
                            onFocus={() => setTradeQueryOpen(true)}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            placeholder="Type a trade (example: Electrician)"
                            disabled={savingJobAlertForm}
                          />
                          {tradeQueryOpen && (
                            <div className="mt-2 rounded-lg border border-gray-200 bg-white shadow-sm">
                              {matchingTradeOptions.slice(0, 8).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => handlePickTrade(opt)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  {opt}
                                </button>
                              ))}
                              {matchingTradeOptions.length === 0 && (
                                <button
                                  type="button"
                                  onClick={() => handlePickTrade(TRADE_OTHER_SENTINEL)}
                                  className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                                >
                                  Other — suggest a new trade
                                </button>
                              )}
                            </div>
                          )}
                          {tradeQueryOpen && tradeOtherNoteOpen && matchingTradeOptions.length === 0 && (
                            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                              <p className="text-xs text-gray-600 mb-2">
                                Typed:{' '}
                                <span className="font-medium text-gray-800">
                                  &quot;{(jobAlertForm.trade_label || '').trim()}&quot;
                                </span>
                              </p>
                              <p className="text-xs text-gray-700 mb-2">
                                Add details for the admin (max 1000 characters).
                              </p>
                              <textarea
                                rows={3}
                                maxLength={1000}
                                value={jobAlertTradeNote}
                                onChange={(e) => setJobAlertTradeNote(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                placeholder="Describe this trade and common job titles"
                                disabled={sendingTradeSuggestion}
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700"
                                  onClick={() => {
                                    setTradeQueryOpen(false);
                                    setTradeOtherNoteOpen(false);
                                    setJobAlertTradeNote('');
                                  }}
                                  disabled={sendingTradeSuggestion}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg disabled:opacity-50"
                                  onClick={handleSendTradeSuggestion}
                                  disabled={sendingTradeSuggestion || !jobAlertTradeNote.trim() || !jobAlertForm.trade_label.trim()}
                                >
                                  {sendingTradeSuggestion ? 'Sending…' : 'Send to admin'}
                                </button>
                              </div>
                            </div>
                          )}
                          {tradeSuggestionSent && (
                            <p className="mt-2 text-xs text-green-700">
                              Sent to admin — we&apos;ll review and add it to the list.
                            </p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="job-alert-min-rate" className="block text-xs font-medium text-gray-700 mb-1">
                            Minimum hourly rate
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                            <input
                              id="job-alert-min-rate"
                              type="text"
                              inputMode="decimal"
                              name="min_hourly_rate_dollars"
                              value={jobAlertForm.min_hourly_rate_dollars}
                              onChange={handleJobAlertFieldChange}
                              className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm"
                              placeholder="25.00"
                              disabled={savingJobAlertForm}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="job-alert-max-mi" className="block text-xs font-medium text-gray-700 mb-1">
                            Max distance (miles)
                          </label>
                          <input
                            id="job-alert-max-mi"
                            type="number"
                            min="1"
                            name="max_distance_miles"
                            value={jobAlertForm.max_distance_miles}
                            onChange={handleJobAlertFieldChange}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            disabled={savingJobAlertForm}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Job duration (work weeks)
                          </label>
                          <p className="text-xs text-gray-600 mb-2">{durationSummary(jobAlertForm.min_duration_weeks, jobAlertForm.max_duration_weeks)}</p>
                          <div className="relative h-10">
                            <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-200" />
                            <div
                              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500"
                              style={{
                                left: `${minDurationPercent}%`,
                                width: `${Math.max(0, maxDurationPercent - minDurationPercent)}%`,
                              }}
                            />
                            <div
                              className="absolute top-1/2 h-6 w-6 md:h-5 md:w-5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-blue-600 bg-white shadow-sm"
                              style={{ left: `${minDurationPercent}%` }}
                            />
                            <div
                              className="absolute top-1/2 h-6 w-6 md:h-5 md:w-5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-blue-600 bg-white shadow-sm"
                              style={{ left: `${maxDurationPercent}%` }}
                            />
                            <input
                              type="range"
                              min="0"
                              max={MAX_DURATION_WEEKS}
                              value={minDurationSlider}
                              onChange={(e) => handleDurationMinChange(e.target.value)}
                              className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0"
                              aria-label="Minimum job duration in weeks"
                              disabled={savingJobAlertForm}
                            />
                            <input
                              type="range"
                              min="0"
                              max={MAX_DURATION_WEEKS}
                              value={maxDurationSlider}
                              onChange={(e) => handleDurationMaxChange(e.target.value)}
                              className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0"
                              aria-label="Maximum job duration in weeks"
                              disabled={savingJobAlertForm}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[11px] text-gray-500">
                            <span>Any min</span>
                            <span>2w</span>
                            <span>4w</span>
                            <span>8w</span>
                            <span>12+w</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-medium text-gray-700">Channels</p>
                        <label className="flex items-center justify-between gap-4">
                          <span className="text-sm text-gray-800">Email</span>
                          <input
                            type="checkbox"
                            name="email_enabled"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={jobAlertForm.email_enabled}
                            onChange={handleJobAlertFieldChange}
                            disabled={savingJobAlertForm}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                          <span className="text-sm text-gray-800">SMS</span>
                          <input
                            type="checkbox"
                            name="sms_enabled"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={jobAlertForm.sms_enabled}
                            onChange={handleJobAlertFieldChange}
                            disabled={savingJobAlertForm}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                          <span className="text-sm text-gray-800">In-app</span>
                          <input
                            type="checkbox"
                            name="app_enabled"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={jobAlertForm.app_enabled}
                            onChange={handleJobAlertFieldChange}
                            disabled={savingJobAlertForm}
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        disabled={savingJobAlertForm}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingJobAlertForm ? 'Saving…' : 'Save job alert preferences'}
                      </button>
                    </form>
                  </SettingsCard>
                )}
              </div>
            )}

            {isAdmin && settingsTab === 'system_controls' && (
              <div
                id="settings-panel-system_controls"
                role="tabpanel"
                aria-labelledby="settings-tab-system_controls"
              >
                <SystemControlsPricing
                  systemSubTab={adminSystemSubTab}
                  onSystemSubTabChange={setAdminSystemSubTab}
                />
              </div>
            )}

          </div>
        </section>
      </SettingsPageShell>

      <NotificationAdvancedModal
        isOpen={!!modalNotificationItem}
        item={modalNotificationItem}
        onClose={() => setModalNotificationItem(null)}
        notificationPrefs={notificationPrefs}
        onPersistNotificationPrefs={handlePersistModalNotificationPrefs}
        isTechnician={isTechnician}
        jobAlertModalBody={null}
        onSaveJobAlerts={() => handleSaveJobAlertPreferences()}
        savingJobAlertForm={savingJobAlertForm}
        savingNotifications={savingNotifications}
        localAdvancedById={localAdvancedById}
        onUpdateLocalAdvanced={(id, data) => setLocalAdvancedById((prev) => ({ ...prev, [id]: data }))}
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />

      <ConfirmModal
        isOpen={!!confirmCertId}
        onClose={() => setConfirmCertId(null)}
        onConfirm={confirmCertificateDelete}
        title="Remove certificate?"
        message="Are you sure you want to remove this certificate?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="destructive"
      />

      <ConfirmModal
        isOpen={confirmDeleteAccount}
        onClose={() => setConfirmDeleteAccount(false)}
        onConfirm={handleDeleteAccountConfirmed}
        title="Delete account permanently?"
        message="This cannot be undone. All account data will be removed."
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        variant="destructive"
      />
    </>
  );
};

export default SettingsPage;
