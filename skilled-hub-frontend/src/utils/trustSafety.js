/**
 * Pure helpers for the admin Trust & Safety workspace. No React, no network —
 * exercised directly by scripts/trustSafety.test.mjs.
 */

export const TRUST_SAFETY_TABS = [
  { id: 'queue', label: 'Needs Review' },
  { id: 'technicians', label: 'All Technicians' },
  { id: 'background_checks', label: 'Background Checks' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'references', label: 'References' },
  { id: 'activity', label: 'Activity / Audit History' },
];

export const REVIEW_TYPE_OPTIONS = [
  { value: 'all', label: 'All review types' },
  { value: 'background_check', label: 'Background checks' },
  { value: 'credential', label: 'Credentials & documents' },
  { value: 'reference', label: 'References' },
];

export const STATUS_OPTIONS = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'pending', label: 'Pending / in progress' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'approved', label: 'Approved / verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired / expiring' },
  { value: 'all', label: 'All statuses' },
];

export const SORT_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'oldest', label: 'Oldest pending first' },
  { value: 'newest', label: 'Newest submitted first' },
];

/** Tabs that are just pre-filtered views of the review queue. */
const TAB_REVIEW_TYPE = {
  background_checks: 'background_check',
  credentials: 'credential',
  references: 'reference',
};

export const DEFAULT_QUEUE_FILTERS = Object.freeze({
  q: '',
  review_type: 'all',
  status: 'needs_review',
  trade: '',
  state: '',
  sort: 'priority',
  page: 1,
  per_page: 25,
});

export function isQueueTab(tab) {
  return tab === 'queue' || Object.prototype.hasOwnProperty.call(TAB_REVIEW_TYPE, tab);
}

/** Review type implied by a tab; queue tab keeps whatever the user picked. */
export function reviewTypeForTab(tab, selected = 'all') {
  if (TAB_REVIEW_TYPE[tab]) return TAB_REVIEW_TYPE[tab];
  return selected || 'all';
}

/** Default status when switching tabs — queue tab is the work list, others are browse views. */
export function defaultStatusForTab(tab) {
  return tab === 'queue' ? 'needs_review' : 'all';
}

export function parseItemKey(key) {
  if (typeof key !== 'string') return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const itemType = key.slice(0, idx);
  const id = Number(key.slice(idx + 1));
  if (!['background_check', 'document', 'reference'].includes(itemType)) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  return { itemType, id };
}

export function buildItemKey(itemType, id) {
  return `${itemType}:${id}`;
}

/**
 * URL <-> state. Keeps the workspace deep-linkable:
 *   /admin/trust-safety?tab=queue&status=needs_review&item=document:12&technician=4
 */
export function parseWorkspaceSearch(search) {
  const params = new URLSearchParams(search || '');
  const tab = TRUST_SAFETY_TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'queue';
  const filters = { ...DEFAULT_QUEUE_FILTERS };
  for (const key of ['q', 'review_type', 'status', 'trade', 'state', 'sort']) {
    const value = params.get(key);
    if (value != null && value !== '') filters[key] = value;
  }
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 0) filters.page = page;
  const perPage = Number(params.get('per_page'));
  if (Number.isInteger(perPage) && perPage > 0) filters.per_page = Math.min(perPage, 100);
  if (!params.has('status')) filters.status = defaultStatusForTab(tab);
  filters.review_type = reviewTypeForTab(tab, filters.review_type);

  const technician = Number(params.get('technician'));
  return {
    tab,
    filters,
    item: parseItemKey(params.get('item')) ? params.get('item') : null,
    technician: Number.isInteger(technician) && technician > 0 ? technician : null,
    verification: params.get('verification') || 'all',
  };
}

export function buildWorkspaceSearch({ tab = 'queue', filters = {}, item = null, technician = null, verification = 'all' }) {
  const params = new URLSearchParams();
  if (tab && tab !== 'queue') params.set('tab', tab);
  const merged = { ...DEFAULT_QUEUE_FILTERS, ...filters };
  for (const key of ['q', 'review_type', 'status', 'trade', 'state', 'sort']) {
    const value = merged[key];
    const isDefault = key === 'status' ? value === defaultStatusForTab(tab) : value === DEFAULT_QUEUE_FILTERS[key];
    if (key === 'review_type' && TAB_REVIEW_TYPE[tab]) continue;
    if (value != null && value !== '' && !isDefault) params.set(key, value);
  }
  if (merged.page && merged.page !== 1) params.set('page', String(merged.page));
  if (merged.per_page && merged.per_page !== DEFAULT_QUEUE_FILTERS.per_page) params.set('per_page', String(merged.per_page));
  if (item && parseItemKey(item)) params.set('item', item);
  if (technician) params.set('technician', String(technician));
  if (verification && verification !== 'all') params.set('verification', verification);
  const str = params.toString();
  return str ? `?${str}` : '';
}

/** Metric card -> workspace state. */
export function applyMetricFilter(current, metricFilter) {
  if (!metricFilter) return current;
  const tab = metricFilter.tab || 'queue';
  if (tab === 'technicians') {
    return { ...current, tab, verification: metricFilter.verification || 'all', item: null };
  }
  return {
    ...current,
    tab,
    item: null,
    filters: {
      ...DEFAULT_QUEUE_FILTERS,
      status: metricFilter.status || 'needs_review',
      review_type: metricFilter.review_type || 'all',
    },
  };
}

export function toneToBadgeVariant(tone) {
  switch (tone) {
    case 'success':
    case 'warning':
    case 'danger':
    case 'info':
    case 'orange':
    case 'neutral':
      return tone;
    default:
      return 'default';
  }
}

export function priorityPresentation(priority) {
  const level = priority?.level || 'normal';
  if (level === 'high') return { label: 'High', variant: 'danger' };
  if (level === 'medium') return { label: 'Medium', variant: 'warning' };
  return { label: 'Normal', variant: 'neutral' };
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(iso, now = Date.now()) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function daysUntil(iso, now = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - now) / 86400000);
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Client-side mirror of the server's write rules so the UI can disable the
 * submit button and explain why. The server re-validates every write.
 */
export function validateDecision(action, { reason = '', confirmed = false } = {}) {
  const errors = [];
  if (!action) return { valid: false, errors: ['No action selected.'] };
  const trimmed = String(reason || '').trim();
  if (action.requires_reason && trimmed.length < 3) {
    errors.push(action.key === 'note' ? 'Enter a note.' : 'A written reason is required.');
  }
  if (action.requires_confirmation && !confirmed) {
    errors.push('Confirm that you understand the consequence.');
  }
  return { valid: errors.length === 0, errors };
}

/** Which review item should be opened after the current one is resolved. */
export function nextPendingKey(items, currentKey) {
  const list = Array.isArray(items) ? items : [];
  const pending = list.filter((it) => it && it.needs_review && it.key !== currentKey);
  if (pending.length === 0) return null;
  const idx = list.findIndex((it) => it?.key === currentKey);
  if (idx === -1) return pending[0].key;
  const after = list.slice(idx + 1).find((it) => it?.needs_review);
  return (after || pending[0]).key;
}

/** Move selection with j/k. Wraps at the ends. */
export function stepKey(items, currentKey, delta) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return null;
  const idx = list.findIndex((it) => it.key === currentKey);
  if (idx === -1) return delta >= 0 ? list[0].key : list[list.length - 1].key;
  const next = (idx + delta + list.length) % list.length;
  return list[next].key;
}

/**
 * Bulk selection is restricted to operations that cannot change an eligibility
 * decision. Background checks are never bulk-selectable.
 */
export function isBulkSelectable(item) {
  if (!item) return false;
  if (item.item_type === 'background_check') return false;
  return Boolean(item.needs_review);
}

export const BULK_ACTIONS = [
  {
    key: 'request_info',
    label: 'Request more information',
    requires_reason: true,
    description: 'Sends the same information request to every selected technician. Does not change any decision.',
  },
];

/** Translate API payload shapes for background check action -> request body. */
export function buildDecisionPayload(item, action, { reason, confirmed }) {
  const base = { expected_updated_at: item?.updated_at || undefined };
  const text = String(reason || '').trim();
  switch (item?.item_type) {
    case 'background_check':
      return {
        endpoint: 'overrideBackgroundCheck',
        body: { ...base, override_status: action.key, reason: text, confirm: Boolean(confirmed) },
      };
    case 'document':
      if (action.key === 'request_info') return { endpoint: 'requestDocumentInfo', body: { reason: text } };
      return {
        endpoint: 'reviewDocument',
        body: { ...base, status: action.key === 'approve' ? 'approved' : 'rejected', reason: text, override: Boolean(action.override) },
      };
    case 'reference':
      if (action.key === 'request_info') return { endpoint: 'requestReferenceInfo', body: { reason: text } };
      if (action.key === 'contact_attempt') return { endpoint: 'recordReferenceContactAttempt', body: {} };
      return {
        endpoint: 'reviewReference',
        body: { ...base, status: action.key === 'approve' ? 'approved' : 'rejected', reason: text, override: Boolean(action.override) },
      };
    default:
      return null;
  }
}

export function describeApiError(error) {
  const code = error?.details?.code;
  switch (code) {
    case 'stale_write':
      return 'Another reviewer updated this item. The latest decision is shown below — review it before acting again.';
    case 'already_reviewed':
      return 'This item was already decided. Use the override action if the decision must change.';
    case 'override_not_allowed':
      return error?.message || 'This override is not allowed for the current provider state.';
    case 'reason_required':
      return 'A written reason is required.';
    case 'confirmation_required':
      return 'Confirmation is required.';
    default:
      return error?.message || 'Something went wrong.';
  }
}

export function isConflictError(error) {
  return error?.status === 409;
}
