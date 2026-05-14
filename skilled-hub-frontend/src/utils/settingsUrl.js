const VALID_TABS = new Set([
  'account',
  'profile',
  'notifications',
  'payment',
  'membership',
  'legal',
  'system_controls',
]);

const VALID_SUBS = new Set([
  'pricing',
  'licensing',
  'mailtrap',
  'email_qa',
  'coupons',
  'map_markers',
  'job_access',
  'ux_copy',
  'marketplace_rules',
  'feature_flags',
  'referral_settings',
  'trust_safety',
]);

export function parseSettingsUrl() {
  if (typeof window === 'undefined') return { tab: 'account', sub: null };
  const params = new URLSearchParams(window.location.search);
  let tab = params.get('tab') || 'account';
  if (tab === 'billing') tab = 'payment';
  if (tab === 'job_access') {
    return { tab: 'system_controls', sub: 'job_access' };
  }
  if (!VALID_TABS.has(tab)) tab = 'account';
  const rawSub = params.get('sub');
  const sub = rawSub && VALID_SUBS.has(rawSub) ? rawSub : null;
  return { tab, sub };
}

export function replaceSettingsUrl(tab, sub) {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname || '/settings';
  const p = new URLSearchParams();
  const tabForUrl = tab === 'payment' ? 'billing' : tab;
  if (tabForUrl && tabForUrl !== 'account') p.set('tab', tabForUrl);
  if (tab === 'system_controls' && sub && sub !== 'pricing') p.set('sub', sub);
  const qs = p.toString();
  window.history.replaceState({}, '', qs ? `${path}?${qs}` : path);
}
