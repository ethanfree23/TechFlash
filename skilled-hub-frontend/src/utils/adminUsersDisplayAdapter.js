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

export const DEFAULT_TABLE_COLUMNS = [
  { key: 'user', label: 'User', visible: true },
  { key: 'type', label: 'Type', visible: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'verification', label: 'Verification', visible: true },
  { key: 'company_trade', label: 'Company / Trade', visible: true },
  { key: 'location', label: 'Location', visible: true },
  { key: 'subscription', label: 'Subscription', visible: true },
  { key: 'activity', label: 'Activity', visible: true },
  { key: 'jobs', label: 'Jobs', visible: true },
  { key: 'joined', label: 'Joined', visible: true },
  { key: 'last_login', label: 'Last login', visible: true },
  { key: 'risk', label: 'Risk', visible: true },
];

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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Safe display helper — never surfaces raw null/undefined in UI. */
export function displayOrFallback(value, fallback = 'Not provided') {
  const s = value == null ? '' : String(value).trim();
  if (!s || s === '—' || s === '-') return fallback;
  return s;
}

function formatLocation(profile) {
  if (!profile) return null;
  const city = profile.city?.trim();
  const state = profile.state?.trim();
  const loc = profile.location?.trim();
  if (city && state) return `${city}, ${state}`;
  if (loc) return loc;
  if (city) return city;
  if (Array.isArray(profile.service_cities) && profile.service_cities.length) {
    return profile.service_cities.slice(0, 2).join(' · ');
  }
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

function isIncompleteProfile(row) {
  const hasName = !!(row.first_name?.trim() && row.last_name?.trim());
  const hasPhone = !!row.phone?.trim();
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
  if (isIncompleteProfile(row)) return 'Incomplete profile';
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

function deriveRiskLevel(row) {
  const logins = Number(row.logins_last_30_days ?? 0);
  const created = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const ageMs = Date.now() - created;
  const incomplete = isIncompleteProfile(row);

  if (logins === 0 && ageMs > THIRTY_DAYS_MS && incomplete) return 'High';
  if (logins === 0 && (ageMs > THIRTY_DAYS_MS || incomplete)) return 'Medium';
  return 'Low';
}

function deriveSubscription(row, detail) {
  const profile = detail?.user?.profile;
  if (!profile) return { tier: 'Free', status: null };
  const level = displayOrFallback(profile.membership_level, 'Free');
  const status = profile.membership_status;
  if (status === 'past_due') return { tier: level, status: 'Past due' };
  if (status === 'trialing') return { tier: level, status: 'Trial' };
  return { tier: level, status: status || null };
}

export function enrichUserRow(row, detail = null) {
  const profile = detail?.user?.profile;
  const accountStatus = deriveAccountStatus(row, detail);
  const verificationStatus = deriveVerificationStatus(row, detail);
  const riskLevel = deriveRiskLevel(row);
  const subscription = deriveSubscription(row, detail);
  const logins30d = Number(row.logins_last_30_days ?? 0);
  const lastLoginAt = detail?.logins?.last_login_at || null;

  const companyTrade =
    row.role === 'technician'
      ? displayOrFallback(row.label || profile?.trade_type, 'Not provided')
      : displayOrFallback(row.company_name || row.label || profile?.company_name, 'Not provided');

  const location = formatLocation(profile) || 'Not provided';

  return {
    ...row,
    displayName: getFullName(row),
    initials: getInitials(row),
    accountStatus,
    verificationStatus,
    riskLevel,
    subscriptionTier: subscription.tier,
    subscriptionStatus: subscription.status,
    logins30d,
    lastLoginAt,
    lastLoginDisplay: lastLoginAt ? formatRelativeTime(lastLoginAt) : 'No activity yet',
    isPendingVerification:
      verificationStatus !== 'Verified' &&
      (verificationStatus.includes('Pending') ||
        verificationStatus.includes('Not verified') ||
        verificationStatus.includes('missing')),
    isFlagged: riskLevel === 'High',
    // TODO(admin-users): wire real suspended state when backend adds account status
    isSuspended: false,
    isRecentlyActive: logins30d > 0,
    companyTradeLabel: companyTrade,
    locationLabel: location,
    profileCompleteness: computeProfileCompleteness(row, detail),
    jobsSummary: detail ? buildJobsSummary(row, detail) : null,
    activityLabel: buildActivityLabel(logins30d, lastLoginAt),
  };
}

export function computeProfileCompleteness(row, detail) {
  const profile = detail?.user?.profile;
  const items = [
    { key: 'phone', label: 'Phone', done: !!row.phone?.trim() },
    { key: 'name', label: 'Full name', done: !!(row.first_name?.trim() && row.last_name?.trim()) },
    { key: 'email', label: 'Email', done: !!row.email?.trim() },
  ];

  if (row.role === 'technician') {
    items.push(
      { key: 'trade', label: 'Trade specialty', done: !!(profile?.trade_type || row.label?.trim()) },
      { key: 'location', label: 'Location', done: !!(profile?.city || profile?.location) },
      { key: 'license', label: 'License', done: false },
      { key: 'insurance', label: 'Insurance', done: false },
      { key: 'payment', label: 'Payment setup', done: !!profile?.stripe_account_id },
      { key: 'photo', label: 'Profile photo', done: false }
    );
  } else if (row.role === 'company') {
    items.push(
      { key: 'company', label: 'Company name', done: !!(row.company_name || profile?.company_name) },
      { key: 'location', label: 'Location', done: !!(profile?.location || profile?.service_cities?.length) },
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
    result = result.filter((u) => (u.locationLabel || u.label || '').toLowerCase().includes(q));
  }
  if (filters.trade?.trim()) {
    const q = filters.trade.trim().toLowerCase();
    result = result.filter((u) => (u.label || '').toLowerCase().includes(q));
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

export function applyClientSearch(rows, searchQ) {
  const q = (searchQ || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((u) => {
    const hay = [
      u.displayName,
      u.email,
      u.phone,
      u.company_name,
      u.label,
      u.role,
      String(u.id),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
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
