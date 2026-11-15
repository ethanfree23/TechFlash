/**
 * Role-aware navigation items for AppHeader (desktop + mobile drawer).
 * Preserves existing permission rules; does not introduce new destinations.
 */

const ROLE_LABELS = {
  admin: 'Admin',
  company: 'Company',
  technician: 'Technician',
};

/**
 * @param {{ role?: string } | null | undefined} user
 * @param {'full'|'minimal'} [navPreset='full']
 */
export function getAppNavItems(user, navPreset = 'full') {
  const role = user?.role;
  const isAdmin = role === 'admin';
  const isCompany = role === 'company';
  const isTechnician = role === 'technician';
  const showCrm = navPreset === 'full' && isAdmin;
  const canRefer = role === 'company' || role === 'technician';

  /** @type {Array<{ id: string, page: string, to: string, label: string, demo?: string }>} */
  const primary = [
    { id: 'dashboard', page: 'dashboard', to: '/dashboard', label: 'Dashboard' },
    { id: 'jobs', page: 'jobs', to: '/jobs', label: 'Jobs', demo: 'jobs-tab' },
  ];

  /** @type {Array<{ id: string, page: string, to: string, label: string }>} */
  const management = [];

  /** @type {Array<{ id: string, page?: string, to?: string, label: string, action?: 'referral'|'logout' }>} */
  const account = [];

  if (navPreset === 'full' && showCrm) {
    primary.push(
      { id: 'messages', page: 'messages', to: '/messages', label: 'Messages' },
      { id: 'users', page: 'users', to: '/admin/users', label: 'Users' }
    );

    // Management: operational admin tools (not account Settings).
    management.push(
      { id: 'job_payments', page: 'job_payments', to: '/admin/job-payments', label: 'Payments' },
      { id: 'reviews', page: 'reviews', to: '/admin/reviews', label: 'Reviews' },
      { id: 'trust_safety', page: 'trust_safety', to: '/admin/trust-safety', label: 'Trust & Safety' },
      // Existing admin Assessments stays under Management (not listed in ACCOUNT).
      { id: 'admin_assessments', page: 'assessments', to: '/admin/assessments', label: 'Assessments' }
    );

    account.push(
      { id: 'crm', page: 'crm', to: '/crm', label: 'CRM' },
      { id: 'settings', page: 'settings', to: '/settings', label: 'Settings' },
      { id: 'logout', action: 'logout', label: 'Log Out' }
    );
  } else if (navPreset === 'full') {
    if (isCompany) {
      primary.push({ id: 'technicians', page: 'technicians', to: '/technicians', label: 'Technicians' });
    }
    primary.push({ id: 'messages', page: 'messages', to: '/messages', label: 'Messages' });
    // Assessments is technician-only; companies view results on technician profiles, not via this nav item.
    if (isTechnician) {
      primary.push({ id: 'assessments', page: 'assessments', to: '/assessments', label: 'Assessments' });
    }

    if (canRefer) {
      account.push({ id: 'referral', action: 'referral', label: 'Send Referral' });
    }
    account.push(
      { id: 'legal', page: 'legal', to: '/legal', label: 'Legal' },
      { id: 'settings', page: 'settings', to: '/settings', label: 'Settings' },
      { id: 'logout', action: 'logout', label: 'Log Out' }
    );
  } else {
    // minimal: Dashboard, Jobs, then account tools (Legal / Settings / Log Out).
    if (canRefer) {
      account.push({ id: 'referral', action: 'referral', label: 'Send Referral' });
    }
    account.push(
      { id: 'legal', page: 'legal', to: '/legal', label: 'Legal' },
      { id: 'settings', page: 'settings', to: '/settings', label: 'Settings' },
      { id: 'logout', action: 'logout', label: 'Log Out' }
    );
  }

  return {
    primary,
    management,
    account,
    /** @deprecated Use `account` — kept for callers that still expect `secondary`. */
    secondary: account,
    showCrm,
    canRefer,
    roleLabel: ROLE_LABELS[role] || role || '',
    isAdmin,
    isCompany,
    isTechnician,
    accountSectionLabel: showCrm ? 'Account & Tools' : 'Account',
  };
}

export { ROLE_LABELS };
