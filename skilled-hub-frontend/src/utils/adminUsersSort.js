import { TRADE_LEVEL_RANK } from './adminUsersDisplayAdapter.js';

function sortValueForKey(row, key) {
  switch (key) {
    case 'admin_star':
      return row.adminStarred ? 1 : 0;
    case 'user':
      return row.displayName?.toLowerCase() || '';
    case 'type':
      return row.role || '';
    case 'status':
      return row.accountStatus || '';
    case 'activation_status':
      return row.activation?.status || '';
    case 'last_contacted':
      return row.activation?.last_contacted_at
        ? new Date(row.activation.last_contacted_at).getTime()
        : 0;
    case 'last_call_outcome':
      return row.activation?.last_call_outcome || '';
    case 'next_follow_up':
      return row.activation?.next_follow_up_at
        ? new Date(row.activation.next_follow_up_at).getTime()
        : 0;
    case 'onboarding_blockers':
      return (row.activation?.onboarding_blockers || []).length;
    case 'crm_availability':
      return row.activation?.current_availability || '';
    case 'trade_license':
      return row.verification?.trade_license?.state || '';
    case 'references':
      return Number(row.verification?.professional_references?.count || 0);
    case 'background_check':
      return row.verification?.background_check?.label || '';
    case 'company_trade':
      return row.companyTradeLabel || '';
    case 'trade_level':
      return TRADE_LEVEL_RANK[row.tradeLevelSlug] || 0;
    case 'experience_years':
      return row.experienceYears ?? -1;
    case 'location':
      return row.locationLabel || '';
    case 'city':
      return row.cityLabel || '';
    case 'state':
      return row.stateLabel || '';
    case 'zip':
      return row.zipLabel || '';
    case 'membership_tier':
      return row.membershipTier || '';
    case 'activity':
      return row.logins30d ?? 0;
    case 'jobs':
      return row.jobsSummary?.accepted ?? row.jobsSummary?.posted ?? 0;
    case 'joined':
      return row.created_at ? new Date(row.created_at).getTime() : 0;
    case 'last_login':
      return row.lastLoginAt ? new Date(row.lastLoginAt).getTime() : 0;
    case 'risk':
      return row.riskLevel || '';
    default:
      return '';
  }
}

/** Sort admin user rows the same way the Users table does. */
export function sortAdminUserRows(rows, sortKey = 'user', sortDir = 'asc') {
  const copy = Array.isArray(rows) ? [...rows] : [];
  const dir = sortDir === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    if (sortKey === 'distance') {
      const aMissing = a.distanceMiles == null || !Number.isFinite(a.distanceMiles);
      const bMissing = b.distanceMiles == null || !Number.isFinite(b.distanceMiles);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return (a.distanceMiles - b.distanceMiles) * dir;
    }
    const av = sortValueForKey(a, sortKey);
    const bv = sortValueForKey(b, sortKey);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * dir;
  });
  return copy;
}

/**
 * Neighbor technician in the filtered+sorted list the admin sees.
 * Skips non-technicians; wraps at either end. `delta` is +1 (next) or -1 (previous).
 */
function neighborTechnicianInList(rows, currentId, sortKey, sortDir, delta) {
  const sorted = sortAdminUserRows(rows, sortKey, sortDir);
  const techs = sorted.filter((u) => u.role === 'technician');
  if (!techs.length) return null;

  const currentKey = currentId == null ? null : String(currentId);
  const idx = techs.findIndex((u) => String(u.id) === currentKey);
  // Missing current: next lands on first tech, previous on last.
  const from = idx === -1 ? (delta > 0 ? -1 : 0) : idx;
  const neighbor = techs[(from + delta + techs.length) % techs.length];
  if (!neighbor || String(neighbor.id) === currentKey) return null;
  return neighbor;
}

/** Next technician after `currentId` (wraps to the first tech at the end). */
export function nextTechnicianInList(rows, currentId, sortKey = 'user', sortDir = 'asc') {
  return neighborTechnicianInList(rows, currentId, sortKey, sortDir, 1);
}

/** Previous technician before `currentId` (wraps to the last tech at the start). */
export function previousTechnicianInList(rows, currentId, sortKey = 'user', sortDir = 'asc') {
  return neighborTechnicianInList(rows, currentId, sortKey, sortDir, -1);
}
