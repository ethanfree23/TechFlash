/**
 * TechFlash CRM display helpers — derived metrics, filters, and safe formatting.
 * All functions tolerate null/undefined/missing arrays (no throws from bad CRM rows).
 */

import { CRM_STATUSES, CRM_TRADE_FILTER_OPTIONS } from './crmConstants';

const MS_DAY = 86400000;

export function formatCrmDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatCrmDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function formatPhoneDisplay(phone) {
  const s = String(phone || '').trim();
  if (!s) return '';
  return s;
}

export function normalizeWebsiteUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

/** Human-friendly website label: no https://, and www. prefix when the host has no other subdomain. */
export function formatWebsiteLabel(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const withoutScheme = raw.replace(/^https?:\/\//i, '').replace(/^\/+/, '');
  if (!withoutScheme) return '';
  const host = withoutScheme.split('/')[0];
  const hostLower = host.toLowerCase();
  if (hostLower === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return withoutScheme;
  }
  if (!hostLower.startsWith('www.')) {
    return `www.${withoutScheme}`;
  }
  return withoutScheme;
}

export function isValidEmail(email) {
  const s = String(email || '').trim();
  if (!s) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function isValidPhoneLoose(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10;
}

export function isValidUrlLoose(url) {
  const s = String(url || '').trim();
  if (!s) return true;
  try {
    const u = normalizeWebsiteUrl(s);
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

export function companyTypeLabel(type) {
  if (!type) return '';
  return String(type)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getStatusBadgeClasses(status) {
  const s = String(status || 'lead').toLowerCase();
  const map = {
    lead: 'bg-slate-100 text-slate-800 border-slate-200',
    contacted: 'bg-sky-50 text-sky-800 border-sky-200',
    qualified: 'bg-teal-50 text-teal-800 border-teal-200',
    proposal: 'bg-violet-50 text-violet-800 border-violet-200',
    prospect: 'bg-amber-50 text-amber-900 border-amber-200',
    customer: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    competitor: 'bg-slate-200 text-slate-800 border-slate-300',
    churned: 'bg-rose-50 text-rose-800 border-rose-200',
    lost: 'bg-red-50 text-red-800 border-red-200',
  };
  return map[s] || map.lead;
}

export function isLinkedToPlatformAccount(lead) {
  if (!lead || typeof lead !== 'object') return false;
  return Boolean(lead.linked_user_id || lead.linked_company_profile_id || lead.linked_account);
}

export function getPrimaryContactPreview(lead) {
  if (!lead || typeof lead !== 'object') return { name: '', email: '', phone: '' };
  const contacts = Array.isArray(lead.contacts) ? lead.contacts : [];
  const primaryRow = contacts.find((c) => c && (c.is_primary === true || c.is_primary === 'true')) || contacts[0];
  const name = String(primaryRow?.name || lead.contact_name || '').trim();
  const email = String(primaryRow?.email || lead.email || '').trim();
  const phone = String(primaryRow?.phone || lead.phone || '').trim();
  return { name, email, phone };
}

export function getCompanyDisplayName(lead) {
  return String(lead?.name || '').trim() || `CRM #${lead?.id ?? ''}`;
}

export function inferMarketBucket(lead) {
  const city = String(lead?.city || '').toLowerCase();
  const state = String(lead?.state || '').toLowerCase();
  const blob = `${city} ${state}`;
  if (!city && !state) return 'other';
  if (blob.includes('houston')) return 'houston';
  if (blob.includes('dallas') || blob.includes('fort worth') || blob.includes('plano')) return 'dallas';
  if (blob.includes('austin')) return 'austin';
  if (blob.includes('san antonio')) return 'san_antonio';
  return 'other';
}

function leadInDateRange(lead, rangeId, now = Date.now()) {
  if (!lead || rangeId === 'all') return true;
  const t = new Date(lead.updated_at || lead.created_at || 0).getTime();
  if (!Number.isFinite(t)) return true;
  if (rangeId === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return t >= start.getTime();
  }
  const days = rangeId === '7d' ? 7 : rangeId === '30d' ? 30 : rangeId === '90d' ? 90 : null;
  if (days == null) return true;
  return t >= now - days * MS_DAY;
}

function leadMatchesTradeFilter(lead, tradeFilterId) {
  if (!tradeFilterId || tradeFilterId === 'all') return true;
  const opt = CRM_TRADE_FILTER_OPTIONS.find((o) => o.id === tradeFilterId);
  if (!opt?.types?.length) return true;
  const types = Array.isArray(lead?.company_types) ? lead.company_types : [];
  return opt.types.some((t) => types.includes(t));
}

function leadMatchesMarketFilter(lead, marketId) {
  if (!marketId || marketId === 'all') return true;
  return inferMarketBucket(lead) === marketId;
}

function isStaleLead(lead, staleDays = 30) {
  const t = new Date(lead?.updated_at || lead?.created_at || 0).getTime();
  if (!Number.isFinite(t)) return false;
  const age = Date.now() - t;
  const cold = ['lead', 'contacted', 'qualified', 'proposal', 'prospect'].includes(String(lead?.status || '').toLowerCase());
  return cold && age > staleDays * MS_DAY;
}

function needsFollowupHeuristic(lead, notesCount = 0) {
  const status = String(lead?.status || '').toLowerCase();
  const t = new Date(lead?.updated_at || lead?.created_at || 0).getTime();
  const daysSince = Number.isFinite(t) ? (Date.now() - t) / MS_DAY : 999;
  if (['lost', 'churned', 'competitor', 'customer'].includes(status)) return false;
  if (notesCount === 0 && ['contacted', 'qualified', 'proposal'].includes(status)) return true;
  if (daysSince > 14 && ['lead', 'contacted'].includes(status)) return true;
  return false;
}

export function matchesQuickPipelineFilter(lead, filterId, notesCount = 0) {
  if (!filterId || filterId === 'all') return true;
  if (CRM_STATUSES.includes(filterId)) {
    return String(lead?.status || '').toLowerCase() === filterId;
  }
  if (filterId === 'unlinked') return !isLinkedToPlatformAccount(lead);
  if (filterId === 'stale') return isStaleLead(lead);
  if (filterId === 'needs_followup') return needsFollowupHeuristic(lead, notesCount);
  return true;
}

export function textMatchesLeadSearch(lead, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const parts = [
    lead?.name,
    lead?.contact_name,
    lead?.email,
    lead?.phone,
    lead?.website,
    lead?.city,
    lead?.street_address,
    ...(Array.isArray(lead?.company_types) ? lead.company_types : []),
  ];
  const blob = parts.map((p) => String(p || '').toLowerCase()).join(' ');
  if (blob.includes(needle)) return true;
  const contacts = Array.isArray(lead?.contacts) ? lead.contacts : [];
  return contacts.some((c) => {
    const sub = [c?.name, c?.email, c?.phone, c?.job_title].map((x) => String(x || '').toLowerCase()).join(' ');
    return sub.includes(needle);
  });
}

export function filterSidebarLeads(leads, filters) {
  const list = Array.isArray(leads) ? leads : [];
  const {
    searchText = '',
    statusSelect = '',
    quickPipeline = 'all',
    linkedFilter = 'all',
    hasNotes = 'all',
    hasContact = 'all',
    hasPhone = 'all',
    dateRange = 'all',
    market = 'all',
    trade = 'all',
  } = filters || {};

  const statusFromQuick = CRM_STATUSES.includes(quickPipeline) ? quickPipeline : '';
  const effectiveStatus = (statusSelect && String(statusSelect)) || statusFromQuick;

  return list.filter((row) => {
    if (!textMatchesLeadSearch(row, searchText)) return false;
    if (effectiveStatus && String(row.status || '').toLowerCase() !== String(effectiveStatus).toLowerCase()) return false;
    const nc = Number(row.notes_count) || 0;
    if (quickPipeline && quickPipeline !== 'all' && !CRM_STATUSES.includes(quickPipeline)) {
      if (!matchesQuickPipelineFilter(row, quickPipeline, nc)) return false;
    }
    if (linkedFilter === 'linked' && !isLinkedToPlatformAccount(row)) return false;
    if (linkedFilter === 'unlinked' && isLinkedToPlatformAccount(row)) return false;
    if (hasNotes === 'yes' && nc < 1) return false;
    if (hasNotes === 'no' && nc > 0) return false;
    const pc = getPrimaryContactPreview(row);
    if (hasContact === 'yes' && !pc.name && !pc.email) return false;
    if (hasContact === 'no' && (pc.name || pc.email)) return false;
    const phone = String(pc.phone || row.phone || row.company_phone || '').trim();
    if (hasPhone === 'yes' && !phone) return false;
    if (hasPhone === 'no' && phone) return false;
    if (!leadInDateRange(row, dateRange)) return false;
    if (!leadMatchesMarketFilter(row, market)) return false;
    if (!leadMatchesTradeFilter(row, trade)) return false;
    return true;
  });
}

export function sortLeads(list, sortId) {
  const arr = [...(Array.isArray(list) ? list : [])];
  const byUpdated = (a, b) => {
    const ta = new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    if (ta !== 0) return ta;
    return (b.id || 0) - (a.id || 0);
  };
  switch (sortId) {
    case 'created_desc':
      return arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    case 'created_asc':
      return arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    case 'name_asc':
      return arr.sort((a, b) => getCompanyDisplayName(a).localeCompare(getCompanyDisplayName(b)));
    case 'unlinked_first':
      return arr.sort((a, b) => {
        const ua = isLinkedToPlatformAccount(a) ? 1 : 0;
        const ub = isLinkedToPlatformAccount(b) ? 1 : 0;
        if (ua !== ub) return ua - ub;
        return byUpdated(a, b);
      });
    case 'updated_desc':
    default:
      return arr.sort(byUpdated);
  }
}

export function computeCrmStatsStrip(leads, filters) {
  const baseFilters = { ...filters, quickPipeline: 'all', statusSelect: '', linkedFilter: 'all', hasNotes: 'all', hasContact: 'all', hasPhone: 'all' };
  const filtered = filterSidebarLeads(leads, baseFilters);
  const all = Array.isArray(leads) ? leads : [];
  const total = all.length;
  const countStatus = (s) => filtered.filter((l) => String(l.status).toLowerCase() === s).length;
  const newLeads = countStatus('lead');
  const contacted = countStatus('contacted');
  const qualified = countStatus('qualified') + countStatus('proposal') + countStatus('prospect');
  const activeCompanies = filtered.filter((l) => String(l.status).toLowerCase() === 'customer').length;
  const unlinked = filtered.filter((l) => !isLinkedToPlatformAccount(l)).length;
  const stale = filtered.filter((l) => isStaleLead(l)).length;
  return {
    totalProspects: total,
    filteredCount: filtered.length,
    newLeads,
    contacted,
    qualified,
    activeCompanies,
    companiesWithOpenJobs: null,
    staleLeads: stale,
    unlinkedRecords: unlinked,
  };
}

export function getMissingFieldsForForm(form) {
  const f = form || {};
  const primary = getPrimaryContactPreview({
    contact_name: f.contact_name,
    email: f.email,
    phone: f.phone,
    contacts: f.contacts,
  });
  const missing = [];
  if (!String(f.name || '').trim()) missing.push('company_name');
  if (!String(f.company_email || f.email || primary.email || '').trim()) missing.push('email');
  if (!String(f.company_phone || f.phone || primary.phone || '').trim()) missing.push('phone');
  if (!String(f.website || '').trim()) missing.push('website');
  if (!Array.isArray(f.company_types) || f.company_types.length === 0) missing.push('trade_type');
  if (!primary.name && !f.contact_name) missing.push('primary_contact');
  if (!f.linked_user_id && !f.linked_company_profile_id) missing.push('platform_link');
  return missing;
}

export function getDataQualityScore(form) {
  const missing = new Set(getMissingFieldsForForm(form));
  let score = 0;
  if (!missing.has('company_name')) score += 15;
  if (!missing.has('email')) score += 12;
  if (!missing.has('phone')) score += 12;
  if (!missing.has('website')) score += 8;
  if (!missing.has('trade_type')) score += 12;
  if (!missing.has('primary_contact')) score += 12;
  const f = form || {};
  const addrParts = [f.street_address, f.city, f.state].map((x) => String(x || '').trim()).filter(Boolean);
  if (addrParts.length >= 2) score += 10;
  if (!missing.has('platform_link')) score += 14;
  if (String(f.notes || '').trim()) score += 5;
  return Math.min(100, Math.round(score));
}

export function getRelationshipTemperature(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'customer') return { key: 'customer', label: 'Active customer' };
  if (['lost', 'churned'].includes(s)) return { key: 'ended', label: 'Churned / lost' };
  if (['competitor'].includes(s)) return { key: 'competitor', label: 'Competitor' };
  if (['contacted', 'qualified', 'proposal', 'prospect'].includes(s)) return { key: 'warm', label: 'Warm lead' };
  if (s === 'lead') return { key: 'cold', label: 'Cold lead' };
  return { key: 'unknown', label: 'Unknown' };
}

export function getNextBestActions({ form, metrics, crmNotesLength, isLinked }) {
  const actions = [];
  const f = form || {};
  const missing = new Set(getMissingFieldsForForm(f));
  if (missing.has('phone')) actions.push({ id: 'add_phone', label: 'Add missing phone number', priority: 1 });
  if (missing.has('primary_contact')) actions.push({ id: 'add_contact', label: 'Add primary contact', priority: 1 });
  if (!isLinked) {
    actions.push({ id: 'provision_account', label: 'Create platform account', priority: 2 });
    actions.push({ id: 'link', label: 'Link platform account', priority: 2 });
  }
  if (isLinked) {
    actions.push({ id: 'add_company_login', label: 'Add company login', priority: 2 });
  }
  if (missing.has('trade_type')) actions.push({ id: 'trade', label: 'Set company trade types', priority: 2 });
  if (String(f.status || '') === 'lead') actions.push({ id: 'contact', label: 'Move to contacted after outreach', priority: 3 });
  if (isLinked && metrics && (metrics.jobs_posted || 0) === 0) {
    actions.push({ id: 'first_job', label: 'Create first job for this company', priority: 2 });
  }
  if (crmNotesLength === 0) actions.push({ id: 'note', label: 'Add first call or email note', priority: 3 });
  actions.push({ id: 'call', label: 'Call this company', priority: 4 });
  return actions.sort((a, b) => a.priority - b.priority);
}

export function getOperationalInsights({ form, metrics, activity, isLinked, crmNotes }) {
  const lines = [];
  const f = form || {};
  const status = String(f.status || '').toLowerCase();
  if (!isLinked) {
    lines.push('This record has no linked platform account — link it to see jobs, spend, and marketplace activity.');
  }
  if (isLinked && metrics && (metrics.jobs_posted || 0) === 0 && ['contacted', 'qualified', 'proposal', 'prospect', 'customer'].includes(status)) {
    lines.push('This company has been in the pipeline but has not posted a job on TechFlash yet.');
  }
  if (isLinked && metrics && (metrics.jobs_open || 0) > 0) {
    lines.push('Companies with open jobs are your highest-priority accounts — check fill rate and applicants.');
  }
  if (!isLinked && !getMissingFieldsForForm(f).includes('phone') && !getMissingFieldsForForm(f).includes('primary_contact') && !getMissingFieldsForForm(f).includes('trade_type')) {
    lines.push('This lead may be ready for activation: contact, phone, and trade type are set.');
  }
  if (isLinked && metrics && (metrics.jobs_completed || 0) >= 2) {
    lines.push('Repeat job activity — nurture this account for ongoing labor needs.');
  }
  const notes = Array.isArray(crmNotes) ? crmNotes : [];
  const lastCall = [...notes].reverse().find((n) => n.contact_method === 'call');
  if (lastCall && !isLinked) {
    lines.push('There is call history on this record; linking an account will connect calls to real job data.');
  }
  if (activity && (activity.messages_count || 0) > 5 && isLinked) {
    lines.push('High message volume on the platform — strong engagement signal.');
  }
  return lines.slice(0, 5);
}

export function getOutreachSnapshot(crmNotes, lead) {
  const notes = Array.isArray(crmNotes) ? crmNotes : [];
  const calls = notes.filter((n) => n.contact_method === 'call').length;
  const emails = notes.filter((n) => n.contact_method === 'email').length;
  const byCreated = [...notes].sort((a, b) => noteTimestamp(a) - noteTimestamp(b));
  const first = byCreated[0]?.created_at ?? null;
  const last = byCreated.length ? byCreated[byCreated.length - 1].created_at : null;
  const latestNote = sortNotesForTimeline(notes, 'newest')[0];
  let outreach = 'Not contacted';
  if (latestNote) {
    if (latestNote.made_contact) outreach = 'Contacted';
    else if (latestNote.contact_method === 'call') outreach = 'Needs follow-up';
  }
  const status = String(lead?.status || '').toLowerCase();
  if (['contacted', 'qualified', 'proposal', 'prospect'].includes(status)) outreach = 'Contacted';
  if (status === 'customer') outreach = 'Interested';
  if (['lost', 'churned'].includes(status)) outreach = 'Not interested';
  return {
    firstContactDate: first,
    lastContactDate: last,
    calls,
    emails,
    notesCount: notes.length,
    latestOutcome: latestNote ? (latestNote.title || '').trim() || '—' : '—',
    outreachStatus: outreach,
  };
}

function noteTimestamp(note, field = 'created_at') {
  const t = new Date(note?.[field] || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function filterNotesForTimeline(notes, filter) {
  const list = Array.isArray(notes) ? notes : [];
  if (!filter || filter === 'all') return list;
  if (filter === 'calls') return list.filter((n) => n.contact_method === 'call');
  if (filter === 'emails') return list.filter((n) => n.contact_method === 'email');
  if (filter === 'notes') return list.filter((n) => n.contact_method === 'note' || !n.contact_method);
  return list;
}

/** Sort root timeline notes; comments stay oldest-first within each thread. */
export function sortNotesForTimeline(notes, sortKey = 'newest') {
  const list = Array.isArray(notes) ? notes : [];
  const key = sortKey || 'newest';
  const withSortedComments = list.map((note) => {
    const comments = Array.isArray(note.comments) ? [...note.comments] : [];
    comments.sort((a, b) => noteTimestamp(a) - noteTimestamp(b));
    return { ...note, comments };
  });

  if (key === 'oldest') {
    withSortedComments.sort((a, b) => noteTimestamp(a) - noteTimestamp(b));
  } else if (key === 'updated') {
    withSortedComments.sort((a, b) => noteTimestamp(b, 'updated_at') - noteTimestamp(a, 'updated_at'));
  } else if (key === 'reminders') {
    withSortedComments.sort((a, b) => {
      const aRem = a.remind_at ? noteTimestamp(a, 'remind_at') : Number.POSITIVE_INFINITY;
      const bRem = b.remind_at ? noteTimestamp(b, 'remind_at') : Number.POSITIVE_INFINITY;
      if (aRem !== bRem) return aRem - bRem;
      return noteTimestamp(b) - noteTimestamp(a);
    });
  } else {
    withSortedComments.sort((a, b) => noteTimestamp(b) - noteTimestamp(a));
  }
  return withSortedComments;
}

export function prepareTimelineNotes(notes, filter, sortKey = 'newest') {
  return sortNotesForTimeline(filterNotesForTimeline(notes, filter), sortKey);
}

export function exportLeadsToCsv(leads) {
  const rows = Array.isArray(leads) ? leads : [];
  const headers = [
    'name',
    'contact_name',
    'email',
    'phone',
    'website',
    'company_types',
    'status',
    'city',
    'state',
    'notes',
  ];
  const esc = (v) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const lines = [headers.join(',')];
  rows.forEach((r) => {
    const pc = getPrimaryContactPreview(r);
    lines.push(
      [
        esc(r.name),
        esc(pc.name || r.contact_name),
        esc(pc.email || r.email),
        esc(pc.phone || r.phone),
        esc(r.website),
        esc((r.company_types || []).join('|')),
        esc(r.status),
        esc(r.city),
        esc(r.state),
        esc(r.notes),
      ].join(','),
    );
  });
  return lines.join('\n');
}
