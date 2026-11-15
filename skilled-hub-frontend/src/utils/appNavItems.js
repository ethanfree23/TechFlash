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

  if (navPreset === 'full' && showCrm) {
    primary.push(
      { id: 'messages', page: 'messages', to: '/messages', label: 'Messages' },
      { id: 'users', page: 'users', to: '/admin/users', label: 'Users' }
    );
  }

  if (navPreset === 'full' && !showCrm) {
    if (isCompany || isAdmin) {
      primary.push({ id: 'technicians', page: 'technicians', to: '/technicians', label: 'Technicians' });
    }
    if (isTechnician) {
      primary.push({ id: 'assessments', page: 'assessments', to: '/assessments', label: 'Assessments' });
    }
    primary.push(
      { id: 'messages', page: 'messages', to: '/messages', label: 'Messages' },
      { id: 'legal', page: 'legal', to: '/legal', label: 'Legal' }
    );
  }

  if (navPreset === 'minimal') {
    primary.push({ id: 'legal', page: 'legal', to: '/legal', label: 'Legal' });
  }

  /** @type {Array<{ id: string, page?: string, to?: string, label: string, action?: 'referral'|'logout', kind?: 'info' }>} */
  const secondary = [];

  secondary.push({ id: 'settings', page: 'settings', to: '/settings', label: 'Settings' });

  if (showCrm) {
    secondary.push(
      { id: 'reviews', page: 'reviews', to: '/admin/reviews', label: 'Reviews' },
      { id: 'job_payments', page: 'job_payments', to: '/admin/job-payments', label: 'Payments' },
      { id: 'trust_safety', page: 'trust_safety', to: '/admin/trust-safety', label: 'Trust & Safety' },
      { id: 'admin_assessments', page: 'assessments', to: '/admin/assessments', label: 'Assessments' }
    );
  }

  secondary.push({
    id: 'user_type',
    kind: 'info',
    label: ROLE_LABELS[role] || (role ? String(role) : 'Account'),
    page: 'user_type',
  });

  if (canRefer) {
    secondary.push({ id: 'referral', action: 'referral', label: 'Send Referral' });
  }

  if (showCrm) {
    secondary.push({ id: 'crm', page: 'crm', to: '/crm', label: 'CRM' });
  }

  secondary.push({ id: 'logout', action: 'logout', label: 'Log Out' });

  return {
    primary,
    secondary,
    showCrm,
    canRefer,
    roleLabel: ROLE_LABELS[role] || role || '',
    isAdmin,
    isCompany,
    isTechnician,
  };
}

export { ROLE_LABELS };
