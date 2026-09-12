import { parseCityState, stripCountryFromAddress } from './usAddress.js';
import { usStateAbbreviation } from './crmUsState.js';

/** Derived display fields, KPIs, tabs, and filters for Admin Users command center. */

export const USER_TABS = [
  { id: 'all', label: 'All users', apiRole: 'all' },
  { id: 'technicians', label: 'Technicians', apiRole: 'technician' },
  { id: 'company', label: 'Company users', apiRole: 'company' },
  { id: 'admins', label: 'Admins', apiRole: null },
  { id: 'pending', label: 'Pending', apiRole: 'all' },
  { id: 'flagged', label: 'Flagged', apiRole: 'all' },
  { id: 'suspended', label: 'Suspended', apiRole: 'all' },
  { id: 'recently_active', label: 'Recently active', apiRole: 'all' },
];

export const TRADE_LEVEL_SLUGS = ['helper', 'apprentice', 'journeyman', 'master'];
export const TRADE_LEVEL_LABELS = {
  helper: 'Helper',
  apprentice: 'Apprentice',
  journeyman: 'Journeyman',
  master: 'Master',
};
export const TRADE_LEVEL_RANK = {
  helper: 1,
  apprentice: 2,
  journeyman: 3,
  master: 4,
};

export const DEFAULT_TABLE_COLUMNS = [
  { key: 'user', label: 'User', visible: true, width: 200 },
  { key: 'type', label: 'Type', visible: true, width: 96 },
  { key: 'status', label: 'Status', visible: true, width: 80 },
  { key: 'verification', label: 'Verification', visible: true, width: 112 },
  { key: 'company_trade', label: 'Company', visible: true, width: 120 },
  { key: 'trade_level', label: 'Level', visible: true, width: 96 },
  { key: 'experience_years', label: 'Years', visible: true, width: 64 },
  { key: 'city', label: 'City', visible: true, width: 104 },
  { key: 'state', label: 'State', visible: true, width: 56 },
  { key: 'membership_tier', label: 'Tier', visible: true, width: 80 },
  { key: 'activity', label: 'Activity', visible: true, width: 120 },
  { key: 'jobs', label: 'Jobs', visible: true, width: 72 },
  { key: 'joined', label: 'Joined', visible: true, width: 80 },
  { key: 'last_login', label: 'Last login', visible: true, width: 104 },
  { key: 'risk', label: 'Risk', visible: true, width: 64 },
];

export function defaultColumnsForTab(tab) {
  return DEFAULT_TABLE_COLUMNS.map((col) => {
    if (col.key === 'company_trade') {
      return { ...col, label: tab === 'technicians' ? 'Trade' : 'Company' };
    }
    return { ...col };
  });
}

export function normalizeTradeLevel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const slug = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (TRADE_LEVEL_SLUGS.includes(slug)) return slug;
  const matched = TRADE_LEVEL_SLUGS.find((s) => TRADE_LEVEL_LABELS[s].toLowerCase() === raw.toLowerCase());
  return matched || slug;
}

export function tradeLevelLabel(value) {
  const slug = normalizeTradeLevel(value);
  if (!slug) return '';
  return TRADE_LEVEL_LABELS[slug] || String(value || '').trim();
}

export function formatExperienceYears(years) {
  if (years == null || years === '') return '';
  const n = Number(years);
  if (!Number.isFinite(n)) return '';
  if (n >= 50) return '50+ yrs';
  return n === 1 ? '1 yr' : `${n} yrs`;
}

export const SAVED_VIEW_PRESETS = [
  { id: 'all', label: 'All users', tab: 'all', filters: {} },
  { id: 'new_this_week', label: 'New this week', tab: 'all', filters: { joinedPreset: 'week' } },
  { id: 'pending_verification', label: 'Pending verification', tab: 'pending', filters: {} },
  { id: 'inactive_technicians', label: 'Inactive technicians', tab: 'technicians', filters: { loginActivity: 'inactive_30d' } },
  { id: 'companies_without_jobs', label: 'Companies without jobs', tab: 'company', filters: { loginActivity: 'inactive_30d' } },
  { id: 'techs_no_jobs', label: 'Techs with no accepted jobs', tab: 'technicians', filters: { hasAcceptedJob: 'no' } },
  { id: 'flagged_accounts', label: 'Flagged accounts', tab: 'flagged', filters: {} },
  { id: 'high_value', label: 'High-value users', tab: 'all', filters: { loginActivity: 'active_30d' } },
  { id: 'trial_ending', label: 'Trial ending soon', tab: 'all', filters: { subscriptionTier: 'trial' } },
  { id: 'subscription_failed', label: 'Subscription failed', tab: 'all', filters: { subscriptionTier: 'past_due' } },
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Safe display helper — never surfaces raw null/undefined in UI. */
export function displayOrFallback(value, fallback = 'Not provided') {
  const s = value == null ? '' : String(value).trim();
  if (!s || s === '—' || s === '-') return fallback;
  return s;
}

function firstPresent(...values) {
  for (const value of values) {
    const s = value == null ? '' : String(value).trim();
    if (s) return s;
  }
  return '';
}

function deriveCityState(profile, row = {}) {
  let city = firstPresent(profile?.city, row.city);
  let state = firstPresent(profile?.state, row.state);
  const loc = firstPresent(profile?.location, row.location);
  const zip = firstPresent(profile?.zip_code, row.zip_code);
  const serviceCities = Array.isArray(profile?.service_cities)
    ? profile.service_cities
    : Array.isArray(row.service_cities)
      ? row.service_cities
      : [];

  if ((!city || !state) && loc) {
    const parsed = parseCityState(loc);
    city = city || parsed.city;
    state = state || parsed.state;
  }
  if (!city) {
    const cityBits = serviceCities.map((c) => String(c || '').trim()).filter(Boolean);
    if (cityBits.length) city = cityBits[0];
  }

  const stateAbbr = usStateAbbreviation(state) || stripCountryFromAddress(state);
  return {
    city: city || '',
    state: stateAbbr || '',
    zip: zip || '',
  };
}

function formatLocation(profile, row = {}) {
  const { city, state, zip } = deriveCityState(profile, row);
  if (city && state) return zip ? `${city}, ${state} ${zip}` : `${city}, ${state}`;
  if (city && zip) return `${city} ${zip}`;
  if (city) return city;
  if (state) return state;
  if (zip) return zip;
  return null;
}

export function getFullName(row) {
  const parts = [row.first_name, row.last_name].map((s) => String(s || '').trim()).filter(Boolean);
  return parts.join(' ') || row.user_name || row.email || 'Unknown';
}

export function getInitials(row) {
  const name = getFullName(row);
  const bits = name.split(/\s+/).filter(Boolean);
  if (bits.length >= 2) return (bits[0][0] + bits[1][0]).toUpperCase();
  if (bits.length === 1 && bits[0].length >= 2) return bits[0].slice(0, 2).toUpperCase();
  return '?';
}

function contactPhone(row, profile) {
  return firstPresent(row.phone, profile?.phone, row.profile_phone);
}

function isIncompleteProfile(row, profile = null) {
  const hasName = !!(row.first_name?.trim() && row.last_name?.trim());
  const hasPhone = !!contactPhone(row, profile);
  const hasRoleData =
    row.role === 'technician'
      ? !!row.label?.trim()
      : row.role === 'company'
        ? !!(row.company_name?.trim() || row.label?.trim())
        : true;
  return !hasName || !hasPhone || !hasRoleData;
}

function deriveAccountStatus(row, detail) {
  // TODO(admin-users): wire real account status when backend adds suspend/deactivate fields
  const pwd = detail?.user?.password_status;
  if (pwd && !pwd.has_password) return 'Invited';
  if (isIncompleteProfile(row, detail?.user?.profile)) return 'Incomplete profile';
  return 'Active';
}

function deriveVerificationStatus(row, detail) {
  const profile = detail?.user?.profile;
  if (row.role === 'technician') {
    if (profile?.background_verified) return 'Verified';
    if (row.label?.trim()) return 'Pending docs';
    return 'Not verified';
  }
  if (row.role === 'company') {
    if (row.company_name?.trim() || profile?.company_name?.trim()) return 'Verified';
    return 'Not verified';
  }
  return 'Not verified';
}

// Auto-flag heuristics are parked. Keep Flagged tab / KPI / column for a later
// review workflow. When a row is flagged, populate reasons + a resolution path.
function deriveFlagState(_row, _detail) {
  return {
    riskLevel: 'Low',
    isFlagged: false,
    flagReasons: [],
    flagResolution: [],
  };
}

function deriveSubscription(row, detail) {
  const profile = detail?.user?.profile;
  const level = displayOrFallback(profile?.membership_level || row.membership_level, 'Free');
  const status = profile?.membership_status || row.membership_status;
  if (status === 'past_due') return { tier: level, status: 'Past due' };
  if (status === 'trialing') return { tier: level, status: 'Trial' };
  return { tier: level, status: status || null };
}

export function enrichUserRow(row, detail = null) {
  const profile = detail?.user?.profile;
  const accountStatus = deriveAccountStatus(row, detail);
  const verificationStatus = deriveVerificationStatus(row, detail);
  const flagState = deriveFlagState(row, detail);
  const subscription = deriveSubscription(row, detail);
  const logins30d = Number(row.logins_last_30_days ?? 0);
  const lastLoginAt = detail?.logins?.last_login_at || row.last_login_at || null;

  const companyTrade =
    row.role === 'technician'
      ? displayOrFallback(row.label || profile?.trade_type, 'Not provided')
      : displayOrFallback(row.company_name || row.label || profile?.company_name, 'Not provided');

  const place = deriveCityState(profile, row);
  const location = formatLocation(profile, row) || 'Not provided';
  const skillClass = row.skill_class || profile?.skill_class || null;
  const experienceYearsRaw = row.experience_years ?? profile?.experience_years;
  const experienceYears =
    experienceYearsRaw == null || experienceYearsRaw === '' ? null : Number(experienceYearsRaw);

  return {
    ...row,
    displayName: getFullName(row),
    initials: getInitials(row),
    avatarUrl: firstPresent(row.avatar_url, profile?.avatar_url),
    avatarUpdatedAt: firstPresent(row.avatar_updated_at, profile?.updated_at),
    accountStatus,
    verificationStatus,
    riskLevel: flagState.riskLevel,
    flagReasons: flagState.flagReasons,
    flagResolution: flagState.flagResolution,
    subscriptionTier: subscription.tier,
    subscriptionStatus: subscription.status,
    membershipTier: subscription.tier,
    tradeLevel: skillClass,
    tradeLevelSlug: normalizeTradeLevel(skillClass),
    tradeLevelLabel: row.role === 'technician' ? tradeLevelLabel(skillClass) : '',
    experienceYears: Number.isFinite(experienceYears) ? experienceYears : null,
    experienceYearsLabel: row.role === 'technician' ? formatExperienceYears(experienceYears) : '',
    logins30d,
    lastLoginAt,
    lastLoginDisplay: lastLoginAt ? formatRelativeTime(lastLoginAt) : '—',
    isPendingVerification:
      verificationStatus !== 'Verified' &&
      (verificationStatus.includes('Pending') ||
        verificationStatus.includes('Not verified') ||
        verificationStatus.includes('missing')),
    isFlagged: flagState.isFlagged,
    // TODO(admin-users): wire real suspended state when backend adds account status
    isSuspended: false,
    isRecentlyActive: logins30d > 0,
    companyTradeLabel: companyTrade,
    cityLabel: place.city,
    stateLabel: place.state,
    locationLabel: location,
    profileCompleteness: computeProfileCompleteness(row, detail),
    jobsSummary: detail ? buildJobsSummary(row, detail) : null,
    activityLabel: buildActivityLabel(logins30d, lastLoginAt),
  };
}

export function computeProfileCompleteness(row, detail) {
  const profile = detail?.user?.profile;
  const items = [
    { key: 'phone', label: 'Phone', done: !!contactPhone(row, profile) },
    { key: 'name', label: 'Full name', done: !!(row.first_name?.trim() && row.last_name?.trim()) },
    { key: 'email', label: 'Email', done: !!row.email?.trim() },
  ];

  if (row.role === 'technician') {
    const licenses = profile?.trade_licenses || [];
    const hasLicense = licenses.some((doc) => doc?.file_url || doc?.document_number);
    items.push(
      { key: 'trade', label: 'Trade specialty', done: !!(profile?.trade_type || row.label?.trim()) },
      {
        key: 'location',
        label: 'Location',
        done: !!(profile?.city || profile?.location || profile?.zip_code || row.city || row.location || row.zip_code),
      },
      { key: 'license', label: 'License', done: hasLicense },
      { key: 'insurance', label: 'Insurance', done: false },
      { key: 'payment', label: 'Payment setup', done: !!profile?.stripe_account_id },
      { key: 'photo', label: 'Profile photo', done: !!profile?.avatar_url }
    );
  } else if (row.role === 'company') {
    items.push(
      { key: 'company', label: 'Company name', done: !!(row.company_name || profile?.company_name) },
      {
        key: 'location',
        label: 'Location',
        done: !!(
          profile?.location ||
          profile?.service_cities?.length ||
          row.location ||
          row.service_cities?.length
        ),
      },
      { key: 'payment', label: 'Payment setup', done: !!profile?.stripe_customer_id }
    );
  }

  const done = items.filter((i) => i.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  const missing = items.filter((i) => !i.done).map((i) => i.label);
  return { percent, missing, items };
}

function buildJobsSummary(row, detail) {
  if (row.role === 'technician') {
    const jobs = detail.jobs || {};
    const ratings = detail.ratings?.received;
    return {
      accepted: jobs.accepted_total ?? '—',
      completed: jobs.completed_total ?? '—',
      rating: ratings?.average ?? ratings?.count ? ratings : null,
    };
  }
  if (row.role === 'company') {
    const jobs = detail.jobs || {};
    return {
      posted: jobs.total ?? '—',
      filled: jobs.by_status?.filled ?? jobs.by_status?.completed ?? '—',
      spend: detail.payments?.total_cents != null ? detail.payments.total_cents : null,
    };
  }
  return null;
}

function buildActivityLabel(logins30d, lastLoginAt) {
  if (logins30d === 0 && !lastLoginAt) {
    return { logins: 'No activity yet', lastActive: null, isEmpty: true };
  }
  const loginText = `${logins30d} login${logins30d === 1 ? '' : 's'}`;
  if (!lastLoginAt) return { logins: loginText, lastActive: null, isEmpty: false };
  return { logins: loginText, lastActive: formatRelativeTime(lastLoginAt), isEmpty: false };
}

export function formatRelativeTime(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function computeKpis(enriched, techInsights = null) {
  const total = enriched.length;
  const technicians = enriched.filter((u) => u.role === 'technician');
  const companies = enriched.filter((u) => u.role === 'company');
  const active30d = enriched.filter((u) => u.logins30d > 0).length;
  const pending = enriched.filter((u) => u.isPendingVerification).length;
  const flagged = enriched.filter((u) => u.isFlagged).length;
  const suspended = enriched.filter((u) => u.isSuspended).length;

  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newThisMonth = enriched.filter((u) => u.created_at && new Date(u.created_at) >= monthStart).length;

  const uniqueCompanies = new Set(
    companies.map((u) => u.company_profile_id).filter(Boolean)
  ).size;

  let techVerified = null;
  let techPending = null;
  if (techInsights?.items) {
    const items = techInsights.items;
    techVerified = items.filter((t) => t.background_verified).length;
    techPending = items.length - techVerified;
  } else {
    techPending = technicians.filter((u) => u.isPendingVerification).length;
  }

  return {
    total,
    newThisMonth,
    technicians: technicians.length,
    techVerified,
    techPending,
    companies: companies.length,
    uniqueCompanies,
    active30d,
    activePercent: total ? Math.round((active30d / total) * 100) : 0,
    pending,
    flagged,
    suspended,
  };
}

export function computeTabCounts(enriched) {
  return {
    all: enriched.length,
    technicians: enriched.filter((u) => u.role === 'technician').length,
    company: enriched.filter((u) => u.role === 'company').length,
    admins: 0,
    pending: enriched.filter((u) => u.isPendingVerification).length,
    flagged: enriched.filter((u) => u.isFlagged).length,
    suspended: enriched.filter((u) => u.isSuspended).length,
    recently_active: enriched.filter((u) => u.isRecentlyActive).length,
  };
}

export function getApiRoleForTab(tabId) {
  const tab = USER_TABS.find((t) => t.id === tabId);
  if (!tab || tab.id === 'admins') return tab?.apiRole ?? 'all';
  if (['pending', 'flagged', 'suspended', 'recently_active'].includes(tabId)) return 'all';
  return tab.apiRole || 'all';
}

export function applyTabFilter(enriched, tabId) {
  switch (tabId) {
    case 'technicians':
      return enriched.filter((u) => u.role === 'technician');
    case 'company':
      return enriched.filter((u) => u.role === 'company');
    case 'admins':
      return [];
    case 'pending':
      return enriched.filter((u) => u.isPendingVerification);
    case 'flagged':
      return enriched.filter((u) => u.isFlagged);
    case 'suspended':
      return enriched.filter((u) => u.isSuspended);
    case 'recently_active':
      return enriched.filter((u) => u.isRecentlyActive);
    default:
      return enriched;
  }
}

export function applyAdvancedFilters(rows, filters = {}) {
  let result = rows;

  if (filters.userType) {
    result = result.filter((u) => u.role === filters.userType);
  }
  if (filters.status) {
    result = result.filter((u) => u.accountStatus === filters.status);
  }
  if (filters.verificationStatus) {
    result = result.filter((u) => u.verificationStatus === filters.verificationStatus);
  }
  if (filters.riskLevel) {
    result = result.filter((u) => u.riskLevel === filters.riskLevel);
  }
  if (filters.company?.trim()) {
    const q = filters.company.trim().toLowerCase();
    result = result.filter((u) => (u.company_name || '').toLowerCase().includes(q));
  }
  if (filters.location?.trim()) {
    const q = filters.location.trim().toLowerCase();
    result = result.filter((u) =>
      [u.locationLabel, u.cityLabel, u.stateLabel, u.label].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }
  if (filters.trade?.trim()) {
    const q = filters.trade.trim().toLowerCase();
    result = result.filter((u) => (u.label || '').toLowerCase().includes(q));
  }
  if (filters.tradeLevel) {
    const want = normalizeTradeLevel(filters.tradeLevel);
    result = result.filter((u) => u.role === 'technician' && normalizeTradeLevel(u.tradeLevel || u.skill_class) === want);
  }
  if (filters.minExperienceYears) {
    const min = Number(filters.minExperienceYears);
    result = result.filter((u) => u.role === 'technician' && Number(u.experienceYears) >= min);
  }
  if (filters.loginActivity === 'active_30d') {
    result = result.filter((u) => u.logins30d > 0);
  }
  if (filters.loginActivity === 'inactive_30d') {
    result = result.filter((u) => u.logins30d === 0);
  }
  if (filters.joinedPreset === 'week') {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    result = result.filter((u) => u.created_at && new Date(u.created_at).getTime() >= cutoff);
  }
  if (filters.subscriptionTier === 'trial') {
    result = result.filter((u) => u.subscriptionStatus === 'Trial');
  }
  if (filters.subscriptionTier === 'past_due') {
    result = result.filter((u) => u.subscriptionStatus === 'Past due');
  }
  if (filters.hasAcceptedJob === 'no') {
    // TODO(admin-users): filter by accepted job count when index exposes job metrics
    result = result.filter((u) => u.role === 'technician' && u.logins30d === 0);
  }

  return result;
}

function searchDigitVariants(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return [];
  const variants = [digits];
  if (digits.length >= 11 && digits.startsWith('1')) variants.push(digits.slice(1));
  if (digits.length === 10) variants.push(`1${digits}`);
  return [...new Set(variants.filter(Boolean))];
}

export function applyClientSearch(rows, searchQ) {
  const q = (searchQ || '').trim().toLowerCase();
  if (!q) return rows;
  const phoneVariants = searchDigitVariants(searchQ);
  return rows.filter((u) => {
    const hay = [
      u.displayName,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      u.company_name,
      u.label,
      u.tradeLevelLabel,
      u.experienceYearsLabel,
      u.zip_code,
      u.cityLabel,
      u.stateLabel,
      u.locationLabel,
      u.role,
      String(u.id),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (hay.includes(q)) return true;
    if (!phoneVariants.length) return false;
    const storedDigits = [u.phone, u.zip_code]
      .filter(Boolean)
      .map((value) => String(value).replace(/\D/g, ''))
      .join(' ');
    return phoneVariants.some((variant) => storedDigits.includes(variant));
  });
}

export function buildActivityTimeline(detail) {
  const events = [];
  const push = (at, type, label) => {
    if (!at) return;
    events.push({ at: new Date(at).getTime(), type, label, iso: at });
  };

  (detail?.logins?.recent || []).forEach((e) => push(e.at, 'login', 'Logged in'));
  (detail?.email_deliveries?.recent || []).slice(0, 5).forEach((e) =>
    push(e.sent_at || e.at, 'email', `Email sent: ${e.subject || e.template || 'message'}`)
  );
  (detail?.jobs?.recent || []).slice(0, 5).forEach((j) => {
    const label =
      detail.role_key === 'technician'
        ? `Job activity: ${j.title || j.status || 'update'}`
        : `Posted job: ${j.title || 'listing'}`;
    push(j.created_at || j.updated_at, 'job', label);
  });
  (detail?.referrals?.recent || []).slice(0, 3).forEach((r) =>
    push(r.created_at, 'referral', 'Referral sent')
  );

  return events.sort((a, b) => b.at - a.at).slice(0, 20);
}

export function getFilterChips(filters) {
  const chips = [];
  const add = (key, label) => chips.push({ key, label, filterKey: key });

  if (filters.userType) add('userType', filters.userType === 'technician' ? 'Technician' : filters.userType === 'company' ? 'Company' : 'Admin');
  if (filters.status) add('status', filters.status);
  if (filters.verificationStatus) add('verificationStatus', filters.verificationStatus);
  if (filters.riskLevel) add('riskLevel', `${filters.riskLevel} risk`);
  if (filters.company) add('company', filters.company);
  if (filters.location) add('location', filters.location);
  if (filters.trade) add('trade', filters.trade);
  if (filters.tradeLevel) add('tradeLevel', tradeLevelLabel(filters.tradeLevel) || filters.tradeLevel);
  if (filters.minExperienceYears) add('minExperienceYears', `${filters.minExperienceYears}+ years`);
  if (filters.loginActivity === 'active_30d') add('loginActivity', 'Logged in last 30 days');
  if (filters.loginActivity === 'inactive_30d') add('loginActivity', 'Inactive 30 days');
  if (filters.joinedPreset === 'week') add('joinedPreset', 'New this week');
  if (filters.subscriptionTier === 'trial') add('subscriptionTier', 'Trial');
  if (filters.subscriptionTier === 'past_due') add('subscriptionTier', 'Past due');
  if (filters.hasAcceptedJob === 'no') add('hasAcceptedJob', 'No accepted jobs');

  return chips;
}

export const STATUS_BADGE_VARIANT = {
  Active: 'success',
  Pending: 'warning',
  Invited: 'info',
  'Incomplete profile': 'warning',
  'Verification required': 'warning',
  Suspended: 'danger',
  Deactivated: 'neutral',
  Banned: 'danger',
  Deleted: 'neutral',
};

export const TYPE_BADGE_VARIANT = {
  technician: 'info',
  company: 'orange',
  admin: 'default',
};

export const VERIFICATION_BADGE_VARIANT = {
  Verified: 'success',
  'Pending docs': 'warning',
  'License missing': 'warning',
  'Insurance missing': 'warning',
  'Company not verified': 'warning',
  'Not verified': 'warning',
  'Identity review': 'warning',
};

/** Resolve empty-state variant from page context. */
export function resolveEmptyVariant({ loadError, hasSearch, hasFilters, activeTab, totalLoaded }) {
  if (loadError) return 'error';
  if (hasSearch) return 'search';
  if (hasFilters) return 'filtered';
  if (activeTab === 'technicians') return 'technicians';
  if (activeTab === 'pending') return 'pending';
  if (activeTab === 'flagged') return 'flagged';
  if (activeTab === 'admins') return 'admins';
  if (totalLoaded === 0) return 'no_users';
  return 'default';
}

export const RISK_BADGE_VARIANT = {
  Low: 'success',
  Medium: 'warning',
  High: 'danger',
  Flagged: 'danger',
};
