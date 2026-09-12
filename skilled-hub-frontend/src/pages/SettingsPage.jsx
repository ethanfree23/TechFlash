import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppHeader from '../components/AppHeader';
import AppFooter from '../components/layout/AppFooter';
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
  verificationAPI,
  verificationReferencesAPI,
} from '../api/api';
import { auth } from '../auth';
import CardPaymentForm from '../components/CardPaymentForm';
import { getStripePublishableKey, isValidStripePublishableKey } from '../stripeConfig';
import JobAddressFields from '../components/JobAddressFields';
import TechnicianTradeLines from '../components/TechnicianTradeLines';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import SystemControlsPricing from '../components/admin/SystemControlsPricing';
import { needsTechnicianMapSetup } from '../utils/technicianMap';
import { requiresElectricalLicenseForState, setLocalOnlyLicenseStates } from '../utils/licensingRules';
import { formatPhoneInput } from '../utils/phone';
import { COMPANY_INDUSTRY_OPTIONS, companyIndustrySelectValue } from '../constants/trades';
import { isTechnicianClass } from '../constants/technicianClass';
import { payloadFromTradeLines, tradeLineValidationMessage, tradeLinesFromProfile } from '../utils/tradeQualifications';
import { getNotificationCategories } from '../config/notificationPreferenceCatalog';
import { isDemoMode, demoSimulatedMessage, withDemoPath } from '../utils/demoMode';
import { mediaUrlWithCacheBust, resolveMediaUrl } from '../utils/mediaUrl';
import AccountRolePanel from '../components/settings/AccountRolePanel';
import AccountActionsCard from '../components/settings/AccountActionsCard';
import { parseSettingsUrl, replaceSettingsUrl } from '../utils/settingsUrl';
import { trackMembershipSubscribe } from '../utils/metaPixel';
import SettingsPageShell from '../components/settings/SettingsPageShell';
import SettingsHeader from '../components/settings/SettingsHeader';
import SettingsTabs from '../components/settings/SettingsTabs';
import SettingsSection from '../components/settings/SettingsSection';
import SettingsCard from '../components/settings/SettingsCard';
import SettingsRow from '../components/settings/SettingsRow';
import SettingsToggle from '../components/settings/SettingsToggle';
import SettingsInput from '../components/settings/SettingsInput';
import SettingsBadge from '../components/settings/SettingsBadge';
import NotificationPreferenceCard from '../components/settings/NotificationPreferenceCard';
import NotificationAdvancedModal from '../components/settings/NotificationAdvancedModal';
import LicenseCredentialsSection from '../components/settings/LicenseCredentialsSection';
import {
  extractDocumentsList,
  isTechnicianCertificateDocument,
} from '../utils/licenseCredentials';

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
const EMPTY_REFERENCE_FORM = {
  full_name: '',
  email: '',
  phone: '',
  company_name: '',
  relationship: '',
};
const DEFAULT_REFERENCE_RELATIONSHIP = 'N/A';

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

const normalizeReferenceEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeReferencePhone = (value) => String(value || '').replace(/\D/g, '');

const buildBackgroundCheckOptionsErrorMessage = (error) => {
  const message = String(error?.message || '').trim();
  if (message) return message;
  return 'Background check setup could not be loaded. TechFlash admin configuration may be incomplete. Please retry or contact support.';
};

const deriveBackgroundCheckStartBlockers = ({
  isTechnician,
  loadingBackgroundCheckOptions,
  startingBackgroundCheck,
  backgroundConsentReady,
}) => {
  const blockers = [];
  if (!isTechnician) blockers.push('not_technician');
  if (loadingBackgroundCheckOptions) blockers.push('options_loading');
  if (startingBackgroundCheck) blockers.push('start_in_progress');
  if (!backgroundConsentReady) blockers.push('consent_missing');
  return blockers;
};

const referenceStatusLabel = (status) => {
  const key = String(status || '').toLowerCase();
  if (key === 'requested') return 'Requested';
  if (key === 'responded') return 'Completed';
  if (key === 'approved') return 'Approved';
  if (key === 'rejected') return 'Rejected';
  return 'Not started';
};

const normalizeVerificationStatus = (status) => String(status || 'not_started').toLowerCase();
const CHECKR_DEMO_BYPASS_STORAGE_KEY = 'checkrDemoBypassEnabled';
const DEMO_BACKGROUND_IN_PROGRESS_STATUSES = new Set(['invited', 'pending', 'processing', 'invitation_sent', 'report_pending']);

const hasInProgressBackgroundCheck = (backgroundCheck) => {
  if (!backgroundCheck) return false;
  const status = String(backgroundCheck?.status || '').toLowerCase();
  const normalizedStatus = String(backgroundCheck?.normalized_status || '').toLowerCase();
  const paymentStatus = String(backgroundCheck?.payment_status || '').toLowerCase();
  return (
    DEMO_BACKGROUND_IN_PROGRESS_STATUSES.has(status)
    || DEMO_BACKGROUND_IN_PROGRESS_STATUSES.has(normalizedStatus)
    || paymentStatus === 'pending'
  );
};

const removeSettingsQueryParams = (paramKeys = []) => {
  if (typeof window === 'undefined') return;
  const nextUrl = new URL(window.location.href);
  paramKeys.forEach((key) => nextUrl.searchParams.delete(key));
  const nextQuery = nextUrl.searchParams.toString();
  const suffix = `${nextQuery ? `?${nextQuery}` : ''}${nextUrl.hash || ''}`;
  window.history.replaceState({}, '', `${nextUrl.pathname}${suffix}`);
};

const isVerificationCompleteStatus = (status) => {
  const key = normalizeVerificationStatus(status);
  return ['verified', 'completed', 'approved', 'clear'].includes(key);
};

const findVerificationSection = (sections, keyword) => (
  (sections || []).find((section) => {
    const key = String(section?.key || '').toLowerCase();
    const title = String(section?.title || '').toLowerCase();
    return key.includes(keyword) || title.includes(keyword);
  })
);

const verificationProgressChip = (status) => {
  const key = normalizeVerificationStatus(status);
  if (isVerificationCompleteStatus(key)) {
    return { variant: 'success', label: 'Complete' };
  }
  if (['pending', 'invitation_sent', 'invited', 'processing', 'consider', 'report_pending', 'in_progress'].includes(key)) {
    return { variant: 'warning', label: 'In progress' };
  }
  if (['rejected', 'failed', 'denied'].includes(key)) {
    return { variant: 'danger', label: 'Needs review' };
  }
  return { variant: 'danger', label: 'Incomplete' };
};

const referenceProgressChip = (count) => {
  if (count >= 3) return { variant: 'success', label: 'Complete' };
  if (count === 2) return { variant: 'warning', label: '2 of 3' };
  if (count === 1) return { variant: 'orange', label: '1 of 3' };
  return { variant: 'danger', label: 'Incomplete' };
};

const licenseProgressChip = (count) => (
  count > 0
    ? { variant: 'success', label: `${count} on file` }
    : { variant: 'danger', label: 'Incomplete' }
);

const SettingsPage = ({ user, onLogout, onUserUpdate }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({});
  const [paymentError, setPaymentError] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_notifications_enabled: true,
    job_alert_notifications_enabled: true,
    email_notification_preferences: DEFAULT_EMAIL_PREFS,
  });
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [jobAlertForm, setJobAlertForm] = useState({
    min_hourly_rate_dollars: '0.00',
    max_distance_miles: 200,
    min_duration_weeks: null,
    max_duration_weeks: null,
    email_enabled: true,
    sms_enabled: true,
    app_enabled: true,
  });
  const [savingJobAlertForm, setSavingJobAlertForm] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certificatePreviewErrors, setCertificatePreviewErrors] = useState({});
  const [deletingCertId, setDeletingCertId] = useState(null);
  const [identityUploadModalOpen, setIdentityUploadModalOpen] = useState(false);
  const [identityDocumentType, setIdentityDocumentType] = useState('drivers_license');
  const [identityDocumentFile, setIdentityDocumentFile] = useState(null);
  const [uploadingIdentityDocument, setUploadingIdentityDocument] = useState(false);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' });
  const [confirmCertId, setConfirmCertId] = useState(null);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [adminSystemSubTab, setAdminSystemSubTab] = useState('pricing');
  const [modalNotificationItem, setModalNotificationItem] = useState(null);
  const [localAdvancedById, setLocalAdvancedById] = useState({});
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [membershipTierDetailList, setMembershipTierDetailList] = useState([]);
  const [membershipTierConfigsLoading, setMembershipTierConfigsLoading] = useState(false);
  const [membershipTierOptions, setMembershipTierOptions] = useState([]);
  const [membershipTierEditing, setMembershipTierEditing] = useState(false);
  const [membershipTierDraft, setMembershipTierDraft] = useState('');
  const [savingMembership, setSavingMembership] = useState(false);
  const [verificationCenter, setVerificationCenter] = useState(null);
  const [loadingVerificationCenter, setLoadingVerificationCenter] = useState(false);
  const [startingBackgroundCheck, setStartingBackgroundCheck] = useState(false);
  const [backgroundDisclosureAccepted, setBackgroundDisclosureAccepted] = useState(false);
  const [backgroundDisclosureAcceptedAt, setBackgroundDisclosureAcceptedAt] = useState('');
  const [backgroundAuthorizationAccepted, setBackgroundAuthorizationAccepted] = useState(false);
  const [backgroundAuthorizationAcceptedAt, setBackgroundAuthorizationAcceptedAt] = useState('');
  const [backgroundCheckOptions, setBackgroundCheckOptions] = useState(null);
  const [loadingBackgroundCheckOptions, setLoadingBackgroundCheckOptions] = useState(false);
  const [backgroundCheckOptionsError, setBackgroundCheckOptionsError] = useState('');
  const [resettingDemoBackgroundCheck, setResettingDemoBackgroundCheck] = useState(false);
  const [localCheckrDemoBypassEnabled, setLocalCheckrDemoBypassEnabled] = useState(false);
  const [selectedPackageName, setSelectedPackageName] = useState('');
  const [verificationReferences, setVerificationReferences] = useState([]);
  const [expandedReferenceRows, setExpandedReferenceRows] = useState({});
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [submittingReference, setSubmittingReference] = useState(false);
  const [referenceFormOpen, setReferenceFormOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [newReference, setNewReference] = useState(EMPTY_REFERENCE_FORM);
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
  const demoMode = isDemoMode();
  const needsMapSetup = isTechnician && needsTechnicianMapSetup(profile);
  const backgroundCheckReady = backgroundCheckOptions?.ready_for_start === true;
  const backgroundCheckDemoBypass = backgroundCheckOptions?.demo_bypass === true;
  // Keep local demo bypass deterministic for demo walkthroughs, even when Checkr options are configured.
  const localCheckrDemoBypass = demoMode && localCheckrDemoBypassEnabled;
  const effectiveCheckrDemoBypass = backgroundCheckDemoBypass || localCheckrDemoBypass;
  const backgroundConsentReady = backgroundDisclosureAccepted && backgroundAuthorizationAccepted;
  const backgroundCheckStartBlockers = useMemo(
    () => deriveBackgroundCheckStartBlockers({
      isTechnician,
      loadingBackgroundCheckOptions,
      startingBackgroundCheck,
      backgroundConsentReady,
    }),
    [isTechnician, loadingBackgroundCheckOptions, startingBackgroundCheck, backgroundConsentReady]
  );
  const backgroundCheckStartEnabled = backgroundCheckStartBlockers.length === 0;
  const backgroundCheckDiagnostics = useMemo(() => ({
    isTechnician,
    demoMode,
    backgroundCheckReady,
    backgroundCheckDemoBypass,
    localCheckrDemoBypass,
    effectiveCheckrDemoBypass,
    backgroundConsentReady,
    loadingBackgroundCheckOptions,
    startingBackgroundCheck,
    startEnabled: backgroundCheckStartEnabled,
    startBlockers: backgroundCheckStartBlockers,
    optionsError: backgroundCheckOptionsError || null,
    configuredPackageName: String(backgroundCheckOptions?.configured_package_name || '').trim() || null,
    packageSelectionReason: backgroundCheckOptions?.package_selection_reason || null,
    selectedPackageName: selectedPackageName || null,
  }), [
    isTechnician,
    demoMode,
    backgroundCheckReady,
    backgroundCheckDemoBypass,
    localCheckrDemoBypass,
    effectiveCheckrDemoBypass,
    backgroundConsentReady,
    loadingBackgroundCheckOptions,
    startingBackgroundCheck,
    backgroundCheckStartEnabled,
    backgroundCheckStartBlockers,
    backgroundCheckOptionsError,
    backgroundCheckOptions?.configured_package_name,
    backgroundCheckOptions?.package_selection_reason,
    selectedPackageName,
  ]);
  const canUndoDemoBackgroundCheck = demoMode && isTechnician && hasInProgressBackgroundCheck(verificationCenter?.background_check);
  const completedReferenceCount = useMemo(
    () => verificationReferences.filter((ref) => {
      const key = String(ref?.status || '').toLowerCase();
      return ['approved', 'responded', 'completed'].includes(key);
    }).length,
    [verificationReferences]
  );
  const verificationChecklistStatus = useMemo(() => {
    const sections = verificationCenter?.sections || [];
    const identityStatus = findVerificationSection(sections, 'identity')?.status;
    const backgroundStatus = findVerificationSection(sections, 'background')?.status;

    return {
      identityComplete: identityStatus
        ? isVerificationCompleteStatus(identityStatus)
        : Boolean(profile?.identity_verified),
      backgroundComplete: backgroundStatus
        ? isVerificationCompleteStatus(backgroundStatus)
        : Boolean(profile?.background_verified),
      referencesComplete: completedReferenceCount >= 3,
    };
  }, [verificationCenter?.sections, completedReferenceCount, profile?.identity_verified, profile?.background_verified]);

  const licensesStatusChip = useMemo(
    () => licenseProgressChip(certificates.length),
    [certificates.length]
  );
  const referencesStatusChip = useMemo(
    () => referenceProgressChip(verificationReferences.length),
    [verificationReferences.length]
  );
  const backgroundStatusChip = useMemo(() => {
    const sectionStatus = findVerificationSection(verificationCenter?.sections, 'background')?.status;
    if (sectionStatus) return verificationProgressChip(sectionStatus);
    if (profile?.background_verified) return verificationProgressChip('verified');
    if (hasInProgressBackgroundCheck(verificationCenter?.background_check)) return verificationProgressChip('pending');
    return verificationProgressChip('not_started');
  }, [verificationCenter?.sections, verificationCenter?.background_check, profile?.background_verified]);

  const profileAvatarUrl = useMemo(() => {
    if (avatarPreview) return avatarPreview;
    if (!profile?.avatar_url || avatarBroken) return null;
    return mediaUrlWithCacheBust(profile.avatar_url, profile.updated_at);
  }, [avatarPreview, avatarBroken, profile?.avatar_url, profile?.updated_at]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [profile?.avatar_url, profile?.updated_at]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const mainTabs = useMemo(() => {
    const base = [
      { id: 'profile', label: 'Profile' },
    ];
    if (isTechnician) {
      base.push({ id: 'verification', label: 'Verification' });
    }
    base.push(
      { id: 'notifications', label: 'Notifications' },
      { id: 'payment', label: 'Billing' },
    );
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
      return 'Manage your profile, verification, job alerts, notifications, membership, payment preferences, and account security.';
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
    const requiredItems = ['First name', 'Last name', 'Phone', 'Profile photo'];

    if (!(form.first_name || '').trim()) missing.push('First name');
    if (!(form.last_name || '').trim()) missing.push('Last name');
    const phoneDigits = String(form.phone || '').replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 10) missing.push('Phone');
    if (!profile?.avatar_url) missing.push('Profile photo');

    if (isCompany) {
      requiredItems.push('Company name', 'Location');
      if (!(form.company_name || '').trim()) missing.push('Company name');
      if (!(form.location || '').trim()) missing.push('Location');
    }

    if (isTechnician) {
      requiredItems.push(
        'Trade type',
        'Class',
        'Bio',
        'ZIP for maps',
        'Identity verification',
        'Background check',
        'References'
      );
      const primaryTrade = (form.trade_lines && form.trade_lines[0]) || {};
      if (!(primaryTrade.trade_type || '').trim()) missing.push('Trade type');
      if (!isTechnicianClass(primaryTrade.skill_class)) missing.push('Class');
      if (!(form.bio || '').trim()) missing.push('Bio');
      if (needsMapSetup) missing.push('ZIP for maps');
      if (!verificationChecklistStatus.identityComplete) missing.push('Identity verification');
      if (!verificationChecklistStatus.backgroundComplete) missing.push('Background check');
      if (!verificationChecklistStatus.referencesComplete) missing.push('References');
    }

    const total = requiredItems.length;
    const pct = Math.round(((total - missing.length) / total) * 100);
    return { pct: Math.min(100, Math.max(0, pct)), missing };
  }, [profile, isAdmin, isCompany, isTechnician, form, needsMapSetup, verificationChecklistStatus]);

  const verificationCompletion = useMemo(() => {
    if (!isTechnician) return { allComplete: true };
    const allComplete = verificationChecklistStatus.identityComplete
      && verificationChecklistStatus.backgroundComplete
      && verificationChecklistStatus.referencesComplete;
    return { allComplete };
  }, [isTechnician, verificationChecklistStatus]);

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
          trade_lines: tradeLinesFromProfile(p),
          availability: p?.availability || '',
          bio: p?.bio || '',
          location: p?.location || '',
          address: p?.address || '',
          city: p?.city || '',
          state: p?.state || 'Texas',
          zip_code: p?.zip_code || '',
          country: p?.country || 'United States',
          latitude: p?.latitude ?? null,
          longitude: p?.longitude ?? null,
          place_id: p?.place_id || '',
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
    if (settingsTab !== 'payment' || !isCompany) return;
    let active = true;
    setBillingHistoryLoading(true);
    settingsAPI.billingHistory()
      .then((res) => {
        if (!active) return;
        setBillingHistory(Array.isArray(res?.billing_history) ? res.billing_history : []);
      })
      .catch(() => {
        if (active) setBillingHistory([]);
      })
      .finally(() => {
        if (active) setBillingHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [settingsTab, isCompany]);

  useEffect(() => {
    if (isTechnician && profile?.id) {
      documentsAPI.getAll()
        .then((docsPayload) => {
          const certs = extractDocumentsList(docsPayload).filter((d) => isTechnicianCertificateDocument(d, profile.id));
          setCertificates(certs);
        })
        .catch(() => setCertificates([]));
    } else {
      setCertificates([]);
    }
  }, [isTechnician, profile?.id]);

  const loadBackgroundCheckOptions = useCallback(async () => {
    if (!isTechnician) return;
    setLoadingBackgroundCheckOptions(true);
    setBackgroundCheckOptionsError('');
    try {
      const options = await verificationAPI.getBackgroundCheckOptions();
      console.info('[Verification] background_check_options loaded', options || null);
      setBackgroundCheckOptions(options || null);
      const configuredPackageName = String(options?.configured_package_name || '').trim();
      if (configuredPackageName) {
        setSelectedPackageName(configuredPackageName);
      }
      if (!options || Object.keys(options).length === 0) {
        setBackgroundCheckOptionsError(
          'Background check setup is not available yet. TechFlash admin configuration is incomplete. Please retry or contact support.'
        );
      }
    } catch (err) {
      setBackgroundCheckOptions(null);
      const errorMessage = buildBackgroundCheckOptionsErrorMessage(err);
      console.error('[Verification] background_check_options failed', {
        message: errorMessage,
        rawError: err,
      });
      setBackgroundCheckOptionsError(errorMessage);
    } finally {
      setLoadingBackgroundCheckOptions(false);
    }
  }, [isTechnician]);

  useEffect(() => {
    if (!isTechnician) return;
    let cancelled = false;
    setLoadingVerificationCenter(true);
    verificationAPI.getCenter()
      .then((data) => {
        if (!cancelled) setVerificationCenter(data);
      })
      .catch(() => {
        if (!cancelled) setVerificationCenter(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingVerificationCenter(false);
      });
    loadBackgroundCheckOptions();
    return () => {
      cancelled = true;
    };
  }, [isTechnician, loadBackgroundCheckOptions]);

  useEffect(() => {
    if (!isTechnician) return;
    let cancelled = false;
    setLoadingReferences(true);
    verificationReferencesAPI.list()
      .then((rows) => {
        if (!cancelled) setVerificationReferences(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setVerificationReferences([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingReferences(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isTechnician]);

  useEffect(() => {
    setAccountEmail(user?.email || auth.getUser()?.email || '');
  }, [user?.email]);

  useEffect(() => {
    if (!isTechnician) return;
    console.info('[Verification] start diagnostics', backgroundCheckDiagnostics);
  }, [isTechnician, backgroundCheckDiagnostics]);

  useEffect(() => {
    setProfile(null);
    setVerificationCenter(null);
    setBackgroundCheckOptions(null);
    setBackgroundCheckOptionsError('');
    setBackgroundDisclosureAccepted(false);
    setBackgroundAuthorizationAccepted(false);
    setBackgroundDisclosureAcceptedAt('');
    setBackgroundAuthorizationAcceptedAt('');
  }, [user?.role]);

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
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(CHECKR_DEMO_BYPASS_STORAGE_KEY);
    if (stored === '0') {
      setLocalCheckrDemoBypassEnabled(false);
      return;
    }
    if (stored === '1' || isDemoMode()) {
      setLocalCheckrDemoBypassEnabled(true);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const membershipParam = params.get('membership');
    const backgroundCheckParam = params.get('background_check');
    const checkrDemoParam = params.get('checkr_demo');
    const forceCheckrDemoParam = params.get('force_checkr_demo');
    if (forceCheckrDemoParam === '1') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CHECKR_DEMO_BYPASS_STORAGE_KEY, '1');
      }
      setLocalCheckrDemoBypassEnabled(true);
      removeSettingsQueryParams(['force_checkr_demo']);
      setAlertModal({
        isOpen: true,
        title: 'Demo bypass enabled',
        message: 'Checkr demo bypass is now enabled in this browser. You can complete the video flow without Checkr credentials.',
        variant: 'success',
      });
      return;
    }
    if (membershipParam === 'success' || membershipParam === 'cancel') {
      if (membershipParam === 'success') {
        trackMembershipSubscribe();
      }
      setSettingsTab('profile');
      removeSettingsQueryParams(['membership']);
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
    if (backgroundCheckParam === 'paid' || backgroundCheckParam === 'cancel') {
      setSettingsTab('verification');
      removeSettingsQueryParams(['background_check']);
      if (backgroundCheckParam === 'paid') {
        verificationAPI.getCenter()
          .then((latest) => {
            setVerificationCenter(latest);
            if (latest?.background_check?.invitation_url) {
              window.location.href = latest.background_check.invitation_url;
              return;
            }
            setAlertModal({
              isOpen: true,
              title: 'Payment received',
              message: 'Payment was completed. If your Checkr invitation is not ready yet, please wait a few seconds and click Start background check again.',
              variant: 'success',
            });
          })
          .catch(() => {
            setAlertModal({
              isOpen: true,
              title: 'Payment received',
              message: 'Payment was completed. We could not refresh status yet, so reload in a few seconds.',
              variant: 'success',
            });
          })
          .finally(() => {
            loadBackgroundCheckOptions();
          });
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Checkout canceled',
          message: 'Background check payment was not completed. You can retry when ready.',
          variant: 'error',
        });
      }
      return;
    }
    if (checkrDemoParam === 'invitation') {
      setSettingsTab('verification');
      removeSettingsQueryParams(['checkr_demo']);
      setAlertModal({
        isOpen: true,
        title: 'Demo invitation shown',
        message: 'Demo bypass is active. This simulates the hosted invitation redirect while Checkr credentials are pending.',
        variant: 'success',
      });
      return;
    }

    const { tab, sub } = parseSettingsUrl();
    const allowed = new Set(mainTabs.map((t) => t.id));
    if (allowed.has(tab)) setSettingsTab(tab);
    if (isAdmin && tab === 'system_controls' && sub) setAdminSystemSubTab(sub);
  }, [fetchProfile, user, onUserUpdate, isAdmin, mainTabs, loadBackgroundCheckOptions]);

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
    setForm((prev) => {
      const next = { ...prev };
      if (patch.address !== undefined) next.address = patch.address;
      if (patch.city !== undefined) next.city = patch.city;
      if (patch.state !== undefined) next.state = patch.state;
      if (patch.zip_code !== undefined) next.zip_code = patch.zip_code;
      if (patch.country !== undefined) next.country = patch.country;
      if ('latitude' in patch || 'longitude' in patch || 'place_id' in patch) {
        next.latitude = patch.latitude ?? null;
        next.longitude = patch.longitude ?? null;
        next.place_id = patch.place_id ?? null;
      } else {
        next.latitude = null;
        next.longitude = null;
        next.place_id = null;
      }
      return next;
    });
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    console.info('[Settings] Profile save started');
    const firstName = (form.first_name || '').trim();
    const lastName = (form.last_name || '').trim();
    const phoneDigits = String(form.phone || '').replace(/\D/g, '');
    const failProfileSave = (message) => {
      setError(message);
      setAlertModal({
        isOpen: true,
        title: 'Could not save',
        message,
        variant: 'error',
      });
    };
    if (!firstName || !lastName) {
      failProfileSave('First name and last name are required.');
      return;
    }
    if (!phoneDigits || phoneDigits.length < 10) {
      failProfileSave('A valid phone number is required (10 digits).');
      return;
    }
    if (isTechnician) {
      const tradeError = tradeLineValidationMessage(form.trade_lines);
      if (tradeError) {
        failProfileSave(tradeError);
        return;
      }
    }

    if (!isAdmin && !profile?.id) {
      failProfileSave('Profile is still loading. Please wait a moment and try again.');
      return;
    }
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
      if (accountRes.user?.email) setAccountEmail(accountRes.user.email);

      if (isCompany) {
        const companyState = (form.state || '').trim();
        const stateRequiresLicense = requiresElectricalLicenseForState(companyState);
        if (stateRequiresLicense && !(form.electrical_license_number || '').trim()) {
          failProfileSave('This state requires an electrical license number.');
          return;
        }
        const { first_name: _fn, last_name: _ln, ...companyPayload } = form;
        await profilesAPI.updateCompanyProfile(profile.id, {
          ...companyPayload,
          state: companyState,
          electrical_license_number: (form.electrical_license_number || '').trim(),
        });
      } else if (isTechnician) {
        const { first_name: _fn2, last_name: _ln2, trade_lines: _tradeLines, ...techPayload } = form;
        const tradePayload = payloadFromTradeLines(form.trade_lines);
        await profilesAPI.updateTechnicianProfile(profile.id, {
          ...techPayload,
          ...tradePayload,
        });
      }
      await fetchProfile();
      setAlertModal({ isOpen: true, title: 'Profile saved!', message: 'Your profile has been updated.', variant: 'success' });
    } catch (err) {
      const message = err.message || 'Failed to save profile';
      console.error('[Settings] Profile save failed', err);
      setError(message);
      setAlertModal({
        isOpen: true,
        title: 'Could not save',
        message,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLicenseUpload = async ({ title, reference, file }) => {
    const failLicenseSave = (message) => {
      setError(message);
      setAlertModal({
        isOpen: true,
        title: 'Could not save',
        message,
        variant: 'error',
      });
      return false;
    };
    if (!isTechnician || !profile?.id) {
      return failLicenseSave('Profile is still loading. Please wait a moment and try again.');
    }
    if (!file) {
      return failLicenseSave('Attach an image before saving.');
    }
    setUploadingCert(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('uploadable_type', 'TechnicianProfile');
      fd.append('uploadable_id', profile.id);
      fd.append('doc_type', 'certificate');
      if (title) fd.append('issuer', title);
      if (reference) fd.append('document_number', reference);
      await documentsAPI.upload(fd);
      const docsPayload = await documentsAPI.getAll();
      setCertificates(extractDocumentsList(docsPayload).filter((d) => isTechnicianCertificateDocument(d, profile.id)));
      setCertificatePreviewErrors({});
      setAlertModal({
        isOpen: true,
        title: 'License saved',
        message: 'Your license has been uploaded.',
        variant: 'success',
      });
      return true;
    } catch (err) {
      failLicenseSave(err.message || 'Failed to save license');
      return false;
    } finally {
      setUploadingCert(false);
    }
  };

  const refreshLicenseDocuments = async () => {
    const docsPayload = await documentsAPI.getAll();
    setCertificates(extractDocumentsList(docsPayload).filter((d) => isTechnicianCertificateDocument(d, profile.id)));
    setCertificatePreviewErrors({});
  };

  const handleLicenseUpdate = async ({ id, title, reference, file }) => {
    const failLicenseSave = (message) => {
      setError(message);
      setAlertModal({
        isOpen: true,
        title: 'Could not save',
        message,
        variant: 'error',
      });
      return false;
    };
    if (!isTechnician || !profile?.id || !id) {
      return failLicenseSave('Profile is still loading. Please wait a moment and try again.');
    }
    setUploadingCert(true);
    setError(null);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('issuer', String(title || '').trim());
      fd.append('document_number', String(reference || '').trim());
      await documentsAPI.update(id, fd);
      await refreshLicenseDocuments();
      setAlertModal({
        isOpen: true,
        title: 'License updated',
        message: file ? 'The license photo was saved.' : 'Your license details were saved.',
        variant: 'success',
      });
      return true;
    } catch (err) {
      failLicenseSave(err.message || 'Failed to update license');
      return false;
    } finally {
      setUploadingCert(false);
    }
  };

  const handleUpdateUsername = async (email) => {
    const nextEmail = String(email || '').trim();
    if (!nextEmail) throw new Error('Email is required.');
    setSavingAccount(true);
    try {
      const previousEmail = user?.email || auth.getUser()?.email || accountEmail;
      const res = await authAPI.updateMe({ email: nextEmail });
      auth.setUser(res.user);
      onUserUpdate?.(res.user);
      setAccountEmail(res.user?.email || nextEmail);
      setAlertModal({
        isOpen: true,
        title: 'Username updated',
        message:
          nextEmail !== previousEmail
            ? 'Email updated. Use your new email to log in next time.'
            : 'Your username is already up to date.',
        variant: 'success',
      });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleUpdatePassword = async (password, passwordConfirmation) => {
    if (!password) throw new Error('Enter a new password.');
    if (password !== passwordConfirmation) throw new Error('Passwords do not match.');
    setSavingAccount(true);
    try {
      const res = await authAPI.updateMe({
        password,
        password_confirmation: passwordConfirmation,
      });
      auth.setUser(res.user);
      onUserUpdate?.(res.user);
      setAlertModal({
        isOpen: true,
        title: 'Password updated',
        message: 'Your password has been updated.',
        variant: 'success',
      });
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

  const handleSaveJobAlertPreferences = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setSavingJobAlertForm(true);
    try {
      const md = jobAlertForm.max_distance_miles === '' ? NaN : Number(jobAlertForm.max_distance_miles);
      const dollars = parseFloat(jobAlertForm.min_hourly_rate_dollars || '0');
      const payload = {
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

  const handleCertificateDelete = (docId) => {
    setConfirmCertId(docId);
  };

  const handleOpenIdentityUploadModal = () => {
    setIdentityDocumentType('drivers_license');
    setIdentityDocumentFile(null);
    setIdentityUploadModalOpen(true);
  };

  const handleIdentityDocumentUpload = async (e) => {
    e.preventDefault();
    if (!profile?.id || !identityDocumentFile) return;
    setUploadingIdentityDocument(true);
    try {
      const fd = new FormData();
      fd.append('file', identityDocumentFile);
      fd.append('uploadable_type', 'TechnicianProfile');
      fd.append('uploadable_id', profile.id);
      fd.append('doc_type', identityDocumentType);
      fd.append('metadata', JSON.stringify({ identity_document_type: identityDocumentType }));
      await documentsAPI.upload(fd);
      const latestCenter = await verificationAPI.getCenter();
      setVerificationCenter(latestCenter);
      setIdentityUploadModalOpen(false);
      setIdentityDocumentFile(null);
      setAlertModal({
        isOpen: true,
        title: 'Identity document uploaded',
        message: 'Your document was submitted for verification review.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Upload failed',
        message: err.message || 'Unable to upload identity document.',
        variant: 'error',
      });
    } finally {
      setUploadingIdentityDocument(false);
    }
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
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPEG, PNG, etc.).');
      e.target.value = '';
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarBroken(false);
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      let updatedProfile = null;
      if (isCompany) {
        updatedProfile = await profilesAPI.updateCompanyProfile(profile.id, fd);
      } else {
        updatedProfile = await profilesAPI.updateTechnicianProfile(profile.id, fd);
      }
      if (updatedProfile && typeof updatedProfile === 'object') {
        setProfile(updatedProfile);
      }
      const hasAvatar = Boolean(updatedProfile?.avatar_url);
      if (!hasAvatar) {
        const refreshedProfile = await fetchProfile({ quiet: true });
        if (!refreshedProfile?.avatar_url) {
          throw new Error('Photo upload completed, but the image is not available yet. Please refresh in a moment.');
        }
      }
      setAvatarPreview(null);
      URL.revokeObjectURL(previewUrl);
      setAlertModal({ isOpen: true, title: 'Photo updated!', message: 'Your profile photo has been updated.', variant: 'success' });
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
      setAvatarBroken(true);
      setError(err.message || 'Failed to upload photo');
    } finally {
      setSaving(false);
      e.target.value = '';
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
      const membershipSuccessPath = withDemoPath('/settings?tab=profile&membership=success');
      const membershipCancelPath = withDemoPath('/settings?tab=profile&membership=cancel');
      const res = await membershipsAPI.update({
        membership_level: level,
        success_url: `${origin}${membershipSuccessPath}`,
        cancel_url: `${origin}${membershipCancelPath}`,
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

  const handleDisclosureAcceptedChange = (e) => {
    const checked = e.target.checked;
    setBackgroundDisclosureAccepted(checked);
    setBackgroundDisclosureAcceptedAt(checked ? new Date().toISOString() : '');
  };

  const handleAuthorizationAcceptedChange = (e) => {
    const checked = e.target.checked;
    setBackgroundAuthorizationAccepted(checked);
    setBackgroundAuthorizationAcceptedAt(checked ? new Date().toISOString() : '');
  };

  const handleDisableLocalCheckrDemoBypass = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHECKR_DEMO_BYPASS_STORAGE_KEY, '0');
    }
    setLocalCheckrDemoBypassEnabled(false);
    setAlertModal({
      isOpen: true,
      title: 'Demo bypass disabled',
      message: 'Local Checkr demo bypass was turned off for this browser session.',
      variant: 'success',
    });
  };

  const handleEnableLocalCheckrDemoBypass = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHECKR_DEMO_BYPASS_STORAGE_KEY, '1');
    }
    setLocalCheckrDemoBypassEnabled(true);
    setAlertModal({
      isOpen: true,
      title: 'Demo bypass enabled',
      message: 'Background check start is now simulated in this browser session.',
      variant: 'success',
    });
  };

  const handleStartBackgroundCheck = async () => {
    console.info('[Verification] start click', backgroundCheckDiagnostics);
    if (!backgroundCheckStartEnabled) {
      setAlertModal({
        isOpen: true,
        title: 'Background check unavailable',
        message: 'Background check is temporarily unavailable. Check browser console for exact blockers and backend status.',
        variant: 'error',
      });
      console.warn('[Verification] start blocked before request', {
        blockers: backgroundCheckStartBlockers,
        diagnostics: backgroundCheckDiagnostics,
      });
      return;
    }
    if (!backgroundConsentReady) {
      setAlertModal({
        isOpen: true,
        title: 'Authorization required',
        message: 'Review and accept the disclosure and authorization statements before starting the background check.',
        variant: 'error',
      });
      console.warn('[Verification] start blocked: consent missing', backgroundCheckDiagnostics);
      return;
    }
    setStartingBackgroundCheck(true);
    try {
      if (effectiveCheckrDemoBypass) {
        const demoInvitationPath = withDemoPath('/settings?tab=verification&checkr_demo=invitation');
        const demoInvitationUrl = `${window.location.origin}${demoInvitationPath}`;
        setVerificationCenter((prev) => ({
          ...(prev || {}),
          background_check: {
            ...(prev?.background_check || {}),
            normalized_status: 'invitation_sent',
            status: 'invited',
            provider_status: 'demo_invitation_sent',
            invitation_url: demoInvitationUrl,
            started_at: new Date().toISOString(),
          },
        }));
        console.info('[Verification] start redirected via demo bypass', {
          invitationUrl: demoInvitationUrl,
          diagnostics: backgroundCheckDiagnostics,
        });
        window.location.href = demoInvitationUrl;
        return;
      }

      const payload = {
        disclosure_accepted: backgroundDisclosureAccepted,
        authorization_accepted: backgroundAuthorizationAccepted,
        ...(backgroundDisclosureAcceptedAt ? { disclosure_accepted_at: backgroundDisclosureAcceptedAt } : {}),
        ...(backgroundAuthorizationAcceptedAt ? { authorization_accepted_at: backgroundAuthorizationAcceptedAt } : {}),
      };
      console.info('[Verification] start request payload', payload);
      const res = await verificationAPI.startBackgroundCheckWithSelection(payload);
      console.info('[Verification] start response', res);
      if (res?.invitation_url) {
        window.location.href = res.invitation_url;
        return;
      }
      if (res?.payment_required) {
        const checkout = await verificationAPI.createBackgroundCheckCheckout();
        if (checkout?.checkout_url) {
          window.location.href = checkout.checkout_url;
          return;
        }
        setAlertModal({
          isOpen: true,
          title: 'Payment required',
          message: res?.message || 'Complete payment to continue your background check.',
          variant: 'error',
        });
      }
      const latest = await verificationAPI.getCenter();
      setVerificationCenter(latest);
      await loadBackgroundCheckOptions();
    } catch (err) {
      console.error('[Verification] start failed', {
        message: err?.message || null,
        error: err,
        diagnostics: backgroundCheckDiagnostics,
      });
      setAlertModal({
        isOpen: true,
        title: 'Unable to start background check',
        message: err.message || 'Try again in a few minutes.',
        variant: 'error',
      });
    } finally {
      setStartingBackgroundCheck(false);
    }
  };

  const handleUndoDemoBackgroundCheck = async () => {
    setResettingDemoBackgroundCheck(true);
    try {
      await verificationAPI.resetDemoBackgroundCheck();
      const latest = await verificationAPI.getCenter();
      setVerificationCenter(latest);
      await loadBackgroundCheckOptions();
      setBackgroundDisclosureAccepted(false);
      setBackgroundAuthorizationAccepted(false);
      setBackgroundDisclosureAcceptedAt('');
      setBackgroundAuthorizationAcceptedAt('');
      setAlertModal({
        isOpen: true,
        title: 'Demo background check reset',
        message: 'Your in-progress demo attempt was cleared. You can start the flow again now.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Unable to reset demo attempt',
        message: err.message || 'Try again in a few moments.',
        variant: 'error',
      });
    } finally {
      setResettingDemoBackgroundCheck(false);
    }
  };

  const handleReferenceFieldChange = (e) => {
    const { name, value } = e.target;
    setNewReference((prev) => ({ ...prev, [name]: value }));
  };

  const toggleReferenceDetails = (referenceId) => {
    setExpandedReferenceRows((prev) => ({ ...prev, [referenceId]: !prev[referenceId] }));
  };

  const resetReferenceForm = () => {
    setNewReference(EMPTY_REFERENCE_FORM);
    setReferenceFormOpen(false);
  };

  const handleAddReference = async (e) => {
    e.preventDefault();

    const nextEmail = normalizeReferenceEmail(newReference.email);
    const nextPhone = normalizeReferencePhone(newReference.phone);
    if (!nextEmail && !nextPhone) {
      setAlertModal({
        isOpen: true,
        title: 'Contact required',
        message: 'Please provide an email or a phone number for this reference.',
        variant: 'error',
      });
      return;
    }

    const duplicateEmail = nextEmail && verificationReferences.some(
      (ref) => normalizeReferenceEmail(ref.email) === nextEmail
    );
    const duplicatePhone = nextPhone && verificationReferences.some(
      (ref) => normalizeReferencePhone(ref.phone) === nextPhone
    );

    if (duplicateEmail || duplicatePhone) {
      setAlertModal({
        isOpen: true,
        title: 'Duplicate reference contact',
        message: duplicateEmail
          ? 'This email is already used by another reference. Please use a different contact.'
          : 'This phone number is already used by another reference. Please use a different contact.',
        variant: 'error',
      });
      return;
    }

    setSubmittingReference(true);
    try {
      await verificationReferencesAPI.create({
        ...newReference,
        relationship: String(newReference.relationship || '').trim() || DEFAULT_REFERENCE_RELATIONSHIP,
      });
      const rows = await verificationReferencesAPI.list();
      setVerificationReferences(Array.isArray(rows) ? rows : []);
      resetReferenceForm();
      setAlertModal({
        isOpen: true,
        title: 'Reference request created',
        message: 'Reference was added and marked as requested.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Unable to add reference',
        message: err.message || 'Try again in a few minutes.',
        variant: 'error',
      });
    } finally {
      setSubmittingReference(false);
    }
  };

  const renderReferencesContent = () => {
    if (loadingReferences) {
      return <p className="text-sm text-gray-500">Loading references...</p>;
    }
    return (
      <>
        <div className="space-y-1 mb-3">
          {verificationReferences.length === 0 ? (
            <p className="text-sm text-gray-500">No references added yet.</p>
          ) : (
            verificationReferences.slice(0, 5).map((ref) => {
              const isExpanded = Boolean(expandedReferenceRows[ref.id]);
              return (
                <div key={ref.id} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
                  <div className="text-xs text-gray-700 flex items-center justify-between gap-3">
                    <span>{ref.full_name}{ref.relationship ? ` (${ref.relationship})` : ''}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-500">
                        {referenceStatusLabel(ref.status)}
                        {ref.responded_at ? ` (${new Date(ref.responded_at).toLocaleDateString()})` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleReferenceDetails(ref.id)}
                        className="px-2 py-0.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        More info
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 border-t border-gray-200 pt-2 text-xs text-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      <p><span className="font-semibold text-gray-800">Email:</span> {ref.email || 'Not provided'}</p>
                      <p><span className="font-semibold text-gray-800">Phone:</span> {ref.phone || 'Not provided'}</p>
                      <p><span className="font-semibold text-gray-800">Company:</span> {ref.company_name || 'Not provided'}</p>
                      <p><span className="font-semibold text-gray-800">Relationship:</span> {ref.relationship || DEFAULT_REFERENCE_RELATIONSHIP}</p>
                      <p>
                        <span className="font-semibold text-gray-800">Requested date:</span>{' '}
                        {ref.requested_at
                          ? new Date(ref.requested_at).toLocaleDateString()
                          : ref.created_at
                            ? new Date(ref.created_at).toLocaleDateString()
                            : 'Not available'}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-800">Responded date:</span>{' '}
                        {ref.responded_at ? new Date(ref.responded_at).toLocaleDateString() : 'Not yet'}
                      </p>
                      <p className="sm:col-span-2">
                        <span className="font-semibold text-gray-800">Current status:</span> {referenceStatusLabel(ref.status)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {referenceFormOpen ? (
          <form onSubmit={handleAddReference} className="rounded-2xl border border-gray-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className="border rounded px-2 py-1 text-xs"
              name="full_name"
              placeholder="Full name"
              value={newReference.full_name}
              onChange={handleReferenceFieldChange}
              required
            />
            <input
              className="border rounded px-2 py-1 text-xs"
              name="relationship"
              placeholder="Relationship (optional)"
              value={newReference.relationship}
              onChange={handleReferenceFieldChange}
            />
            <input
              className="border rounded px-2 py-1 text-xs"
              name="email"
              type="email"
              placeholder="Email"
              value={newReference.email}
              onChange={handleReferenceFieldChange}
              required={!String(newReference.phone || '').trim()}
            />
            <input
              className="border rounded px-2 py-1 text-xs"
              name="phone"
              placeholder="Phone"
              value={newReference.phone}
              onChange={handleReferenceFieldChange}
              required={!String(newReference.email || '').trim()}
            />
            <p className="sm:col-span-2 text-[11px] text-gray-500">
              Email or phone is required (at least one).
            </p>
            <input
              className="border rounded px-2 py-1 text-xs sm:col-span-2"
              name="company_name"
              placeholder="Company (optional)"
              value={newReference.company_name}
              onChange={handleReferenceFieldChange}
            />
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={submittingReference}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {submittingReference ? 'Saving...' : 'Save reference'}
              </button>
              <button
                type="button"
                onClick={resetReferenceForm}
                disabled={submittingReference}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setReferenceFormOpen(true)}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            + Add reference
          </button>
        )}
      </>
    );
  };

  const renderBackgroundCheckContent = () => {
    if (loadingVerificationCenter) {
      return <p className="text-sm text-gray-500">Loading background check...</p>;
    }

    const identityStatus = findVerificationSection(verificationCenter?.sections, 'identity')?.status
      || (profile?.identity_verified ? 'verified' : 'not_started');
    const identityChip = verificationProgressChip(identityStatus);
    const canUploadIdentityDoc = !isVerificationCompleteStatus(identityStatus);
    const backgroundCheck = verificationCenter?.background_check;
    const checkrLink = backgroundCheck?.dashboard_url || backgroundCheck?.report_url;
    const invitationUrl = backgroundCheck?.invitation_url;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900">Identity document</p>
            <SettingsBadge variant={identityChip.variant}>{identityChip.label}</SettingsBadge>
          </div>
          {canUploadIdentityDoc && (
            <button
              type="button"
              onClick={handleOpenIdentityUploadModal}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Upload document
            </button>
          )}
        </div>

        {loadingBackgroundCheckOptions ? (
          <p className="text-xs text-gray-500">Loading background check options...</p>
        ) : (backgroundCheckOptionsError && !effectiveCheckrDemoBypass) ? (
          <div className="rounded-lg border border-gray-200 p-2">
            <p className="text-xs text-gray-700">{backgroundCheckOptionsError}</p>
            <button
              type="button"
              onClick={loadBackgroundCheckOptions}
              className="mt-1 inline-flex rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        ) : null}

        {effectiveCheckrDemoBypass && (
          <p className="text-xs text-gray-600">
            Demo bypass is active. Start flow is simulated for walkthrough recording.
          </p>
        )}
        {demoMode && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-600">
              {localCheckrDemoBypass
                ? 'Local demo bypass is currently on for this browser.'
                : 'Local demo bypass is currently off for this browser.'}
            </p>
            <button
              type="button"
              onClick={localCheckrDemoBypass ? handleDisableLocalCheckrDemoBypass : handleEnableLocalCheckrDemoBypass}
              className="inline-flex rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {localCheckrDemoBypass ? 'Disable demo bypass' : 'Enable demo bypass'}
            </button>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-medium text-gray-900">Disclosure and authorization</p>
          <p className="mt-1 text-xs text-gray-600">
            TechFlash uses Checkr to process background reports. Review these notices and authorize the check before starting.
          </p>
          <div className="mt-2 space-y-2 text-xs text-gray-800">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={backgroundDisclosureAccepted}
                onChange={handleDisclosureAcceptedChange}
                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                I acknowledge I received the disclosure that a consumer report may be obtained for background screening.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={backgroundAuthorizationAccepted}
                onChange={handleAuthorizationAcceptedChange}
                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                I authorize TechFlash and Checkr to obtain and process my background report for verification and job eligibility.
              </span>
            </label>
          </div>
          {(backgroundDisclosureAcceptedAt || backgroundAuthorizationAcceptedAt) && (
            <p className="mt-2 text-[11px] text-gray-500">
              Consent captured:
              {backgroundDisclosureAcceptedAt ? ` disclosure ${new Date(backgroundDisclosureAcceptedAt).toLocaleString()}` : ''}
              {backgroundAuthorizationAcceptedAt ? `, authorization ${new Date(backgroundAuthorizationAcceptedAt).toLocaleString()}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStartBackgroundCheck}
            disabled={startingBackgroundCheck || loadingBackgroundCheckOptions || !backgroundCheckStartEnabled || !backgroundConsentReady}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {startingBackgroundCheck ? 'Starting...' : 'Start background check'}
          </button>
          {isDemoMode() && isTechnician && (
            <button
              type="button"
              onClick={handleUndoDemoBackgroundCheck}
              disabled={!canUndoDemoBackgroundCheck || resettingDemoBackgroundCheck}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {resettingDemoBackgroundCheck ? 'Undoing...' : 'Undo demo attempt'}
            </button>
          )}
          {checkrLink && (
            <a
              href={checkrLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              Open Checkr report
            </a>
          )}
          {invitationUrl && (
            <a
              href={invitationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              Continue Checkr invitation
            </a>
          )}
        </div>
      </div>
    );
  };

  const renderProfileCompletionCard = () => {
    const verificationGaps = new Set(['Identity verification', 'Background check', 'References']);
    return (
      <SettingsCard
        title="Profile completion"
        description={isTechnician
          ? 'Includes profile details plus identity, background check, and references.'
          : 'Based on fields on this page only.'}
      >
        <div className="flex items-end gap-3">
          <p className="text-3xl font-bold text-gray-900">{profileCompletion.pct}%</p>
          <p className="text-sm text-gray-600 pb-1">complete</p>
        </div>
        {profileCompletion.missing.length > 0 ? (
          <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 space-y-1">
            {profileCompletion.missing.map((m) => (
              <li key={m}>
                {verificationGaps.has(m) ? (
                  <button
                    type="button"
                    onClick={() => setSettingsTab('verification')}
                    className="text-blue-700 hover:underline"
                  >
                    {m}
                  </button>
                ) : (
                  m
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-emerald-800">Great — no obvious gaps from this checklist.</p>
        )}
      </SettingsCard>
    );
  };

  const renderVerificationNudge = () => {
    if (!isTechnician || verificationCompletion.allComplete) return null;
    return (
      <div className="w-full max-w-sm shrink-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:ml-auto">
        <p className="text-sm text-amber-900">
          Identity, background check, and references are on the Verification tab.
        </p>
        <button
          type="button"
          onClick={() => setSettingsTab('verification')}
          className="mt-2 inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Finish verification
        </button>
      </div>
    );
  };

  const renderLicensesAndCertificates = () => (
    <LicenseCredentialsSection
      certificates={certificates}
      uploading={uploadingCert}
      deletingId={deletingCertId}
      previewErrors={certificatePreviewErrors}
      onPreviewError={(id) => setCertificatePreviewErrors((prev) => ({ ...prev, [id]: true }))}
      onDelete={handleCertificateDelete}
      onUpload={handleLicenseUpload}
      onUpdate={handleLicenseUpdate}
    />
  );

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
      <SettingsPageShell wide>
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
            {settingsTab === 'profile' && (
              <div id="settings-panel-profile" role="tabpanel" aria-labelledby="settings-tab-profile">
          {needsMapSetup && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                {profile?.zip_code
                  ? "We couldn't place your ZIP on the map"
                  : profile?.address || profile?.city
                    ? "We couldn't place your address on the map"
                    : 'Add a ZIP for the map'}
              </p>
              <p className="text-sm text-amber-800 mt-1">
                {profile?.zip_code
                  ? 'A 5-digit US ZIP is enough for your home pin. Street address is optional.'
                  : 'Add a ZIP below. Street address is optional.'}
              </p>
            </div>
          )}
          {isAdmin ? (
            <form onSubmit={handleProfileSubmit} className="space-y-4" noValidate>
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
          <form onSubmit={handleProfileSubmit} className="space-y-4" noValidate>
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-start">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="relative">
                  {profileAvatarUrl ? (
                    <img
                      src={profileAvatarUrl}
                      alt=""
                      className="h-56 w-56 rounded-full object-cover border-2 border-gray-200"
                      onError={() => {
                        setAvatarBroken(true);
                        setAvatarPreview(null);
                      }}
                    />
                  ) : (
                    <div className="flex h-56 w-56 items-center justify-center rounded-full bg-gray-200 text-6xl font-bold text-gray-500">
                      {(form.first_name || user?.first_name || user?.email || '?')[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <label className="absolute bottom-1 right-1 cursor-pointer rounded-full bg-blue-600 p-3 text-white hover:bg-blue-700">
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                  </label>
                </div>
                <div className="text-sm text-gray-500">Click to change photo</div>
              </div>
              {(isCompany || isTechnician) && (
                <div className="w-full min-w-0 max-w-md">
                  {renderProfileCompletionCard()}
                </div>
              )}
              {renderVerificationNudge()}
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
                  <select
                    name="industry"
                    value={companyIndustrySelectValue(form.industry)}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Select company type</option>
                    {form.industry &&
                      !COMPANY_INDUSTRY_OPTIONS.some(
                        (opt) =>
                          opt.label === companyIndustrySelectValue(form.industry)
                      ) && (
                        <option value={form.industry}>{form.industry}</option>
                      )}
                    {COMPANY_INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt.trade} value={opt.label}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
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
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trades</label>
                  <p className="mb-2 text-xs text-gray-500">Add each trade you perform, with class and years of experience.</p>
                  <TechnicianTradeLines
                    lines={form.trade_lines}
                    onChange={(trade_lines) => setForm((prev) => ({ ...prev, trade_lines }))}
                    idPrefix="settings-trade"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Availability</label>
                  <input name="availability" value={form.availability || ''} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Full-time, Part-time" />
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
                        ZIP needed for map
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
                  {profile?.geocode_status === 'failed' && (
                    <p className="mt-2 text-xs text-amber-800">
                      We couldn't place this ZIP on the map. Check that it is a valid 5-digit US ZIP. Street address is optional.
                    </p>
                  )}
                  {needsMapSetup && (
                    <p className="mt-2 text-xs text-amber-800">
                      A ZIP is enough to center the map and sort nearby jobs.
                    </p>
                  )}
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
                <div
                  id="settings-account"
                  className="mt-8 space-y-4 border-t border-gray-200 pt-6"
                >
                {isAdmin && (
                  <SettingsCard
                    title="Account role"
                    collapsible
                    defaultOpen={isDemoMode() || auth.isMasquerading()}
                    description={
                      isDemoMode() || auth.isMasquerading()
                        ? 'Expand to switch demo roles or return to admin.'
                        : 'Expand to open the demo environment.'
                    }
                  >
                    <SettingsRow
                      title="Role"
                      description="Determines marketplace permissions and available settings tabs."
                      control={<span className="text-sm font-semibold text-gray-800">{roleBadgeLabel}</span>}
                    />
                    <AccountRolePanel roleLabel={roleBadgeLabel} />
                  </SettingsCard>
                )}

                <AccountActionsCard
                  key="account-actions-collapsed"
                  currentEmail={accountEmail}
                  saving={savingAccount}
                  onUpdateUsername={handleUpdateUsername}
                  onUpdatePassword={handleUpdatePassword}
                  onDeleteAccount={() => setConfirmDeleteAccount(true)}
                />
                </div>
              </div>
            )}

            {isTechnician && settingsTab === 'verification' && (
              <div id="settings-panel-verification" role="tabpanel" aria-labelledby="settings-tab-verification" className="space-y-6">
                <SettingsCard
                  title="Licenses and certificates"
                  description="Upload license and certification images so companies can match you to jobs."
                  headerRight={<SettingsBadge variant={licensesStatusChip.variant}>{licensesStatusChip.label}</SettingsBadge>}
                >
                  {renderLicensesAndCertificates()}
                </SettingsCard>
                <SettingsCard
                  title="Professional references"
                  description="Add three professional references."
                  headerRight={<SettingsBadge variant={referencesStatusChip.variant}>{referencesStatusChip.label}</SettingsBadge>}
                >
                  {renderReferencesContent()}
                </SettingsCard>
                <SettingsCard
                  title="Background check"
                  description="Authorize the check, then start or continue the Checkr flow."
                  headerRight={<SettingsBadge variant={backgroundStatusChip.variant}>{backgroundStatusChip.label}</SettingsBadge>}
                >
                  {renderBackgroundCheckContent()}
                </SettingsCard>
              </div>
            )}

            {settingsTab === 'payment' && (
              <div
                id="settings-panel-payment"
                role="tabpanel"
                aria-labelledby="settings-tab-payment"
                data-demo="payments-section"
                className="overflow-visible"
              >
          {paymentError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{paymentError}</div>}
          {paymentSuccess && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{paymentSuccess}</div>}
          {isDemoMode() && (
            <p className="mb-4 text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              {demoSimulatedMessage()} Stripe checkout and payouts run in test mode only.
            </p>
          )}

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
              <p className="text-gray-600 mb-4">Add a credit or debit card. Priced jobs are charged when you post them.</p>
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
              <p className="text-gray-600 mb-2">
                Connect your bank account to receive payouts when jobs are completed.
              </p>
              {profile?.stripe_payout_ready ? (
                <p className="text-green-700 font-medium mb-4">Payout-ready — charges and payouts are enabled.</p>
              ) : profile?.stripe_connected ? (
                <p className="text-amber-800 font-medium mb-4">Onboarding incomplete or restricted. Finish Stripe Connect before payouts can be sent.</p>
              ) : (
                <p className="text-gray-500 mb-4">Not connected.</p>
              )}
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
              {billingHistoryLoading ? (
                <p className="text-sm text-gray-600">Loading billing history…</p>
              ) : billingHistory.length === 0 ? (
                <p className="text-sm text-gray-600">No job charges or refunds yet.</p>
              ) : (
                <ul className="space-y-2">
                  {billingHistory.slice(0, 25).map((row) => (
                    <li key={row.id} className="text-sm border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{row.job_title || `Job #${row.job_id}`}</div>
                      <div className="text-gray-600">
                        {row.transaction_type?.replace(/_/g, ' ')} · {row.status} · ${((row.amount_cents || 0) / 100).toFixed(2)}
                      </div>
                      {row.occurred_at && (
                        <div className="text-xs text-gray-500">{new Date(row.occurred_at).toLocaleString()}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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
                data-demo="notifications-section"
                className="space-y-6"
              >
                <SettingsSection
                  title="Notification center"
                  description="Choose what we email you about. Security, password reset, payment receipts, and legal notices stay on."
                />

                {isTechnician && (
                  <SettingsCard
                    title="Job alert filters"
                    description="Pay floor, distance, duration, and channels for nearby jobs."
                    collapsible
                    defaultOpen={false}
                  >
                    <form onSubmit={handleSaveJobAlertPreferences} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
      <AppFooter />

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

      {identityUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Upload identity document</h3>
            <p className="mt-1 text-sm text-gray-600">Choose a government-issued document to verify your identity.</p>
            <form onSubmit={handleIdentityDocumentUpload} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Document type</span>
                <select
                  value={identityDocumentType}
                  onChange={(e) => setIdentityDocumentType(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="drivers_license">Driver&apos;s license</option>
                  <option value="passport">Passport</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Document file</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setIdentityDocumentFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  required
                />
                {identityDocumentFile && (
                  <p className="mt-1 text-xs text-gray-500">Selected: {identityDocumentFile.name}</p>
                )}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIdentityUploadModalOpen(false);
                    setIdentityDocumentFile(null);
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingIdentityDocument || !identityDocumentFile}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadingIdentityDocument ? 'Uploading...' : 'Upload document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

