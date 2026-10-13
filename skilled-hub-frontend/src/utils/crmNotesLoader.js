import { formatPhoneInput } from './phone.js';
import { CRM_STATUSES, CRM_NOTE_CONTACT_METHODS } from './crmConstants.js';

/**
 * CRM notes loader: turns a spreadsheet (company URL + sales note + optional new contacts)
 * into rows the API can apply to existing CRM companies. Parsing/matching here mirrors
 * `CrmNotesLoader` on the Rails side so the preview matches what the server will do.
 */

export const NOTES_LOADER_COLUMNS = [
  { key: 'website', label: 'Company URL', aliases: ['website', 'url', 'company_url', 'site', 'link', 'domain', 'web', 'company_website', 'homepage', 'company_link'] },
  { key: 'company_name', label: 'Company', aliases: ['company', 'company_name', 'name', 'business', 'business_name', 'account'] },
  { key: 'note', label: 'Note', aliases: ['note', 'notes', 'update', 'summary', 'call_notes', 'what_happened', 'details', 'conversation', 'recap', 'activity_notes', 'comments'] },
  { key: 'contact_method', label: 'Method', aliases: ['contact_method', 'method', 'type', 'channel', 'how', 'touch_type', 'activity', 'activity_type', 'interaction'] },
  { key: 'made_contact', label: 'Reached?', aliases: ['made_contact', 'reached', 'connected', 'spoke', 'talked', 'contact_made', 'got_through'] },
  { key: 'note_date', label: 'Date', aliases: ['date', 'note_date', 'when', 'activity_date', 'call_date', 'contact_date'] },
  { key: 'remind_at', label: 'Follow-up', aliases: ['remind_at', 'remind', 'reminder', 'follow_up', 'followup', 'follow_up_date', 'next_step', 'next_follow_up', 'callback', 'call_back', 'next_touch'] },
  { key: 'status', label: 'Status', aliases: ['status', 'stage', 'pipeline', 'pipeline_stage', 'new_status'] },
  { key: 'title', label: 'Title', aliases: ['title', 'subject', 'headline', 'note_title'] },
  { key: 'contact_name', label: 'Contact name', aliases: ['contact_name', 'contact', 'new_contact', 'person', 'new_contact_name', 'who', 'contact_person'] },
  { key: 'contact_email', label: 'Contact email', aliases: ['contact_email', 'email', 'new_contact_email', 'e_mail'] },
  { key: 'contact_phone', label: 'Contact phone', aliases: ['contact_phone', 'phone', 'new_contact_phone', 'cell', 'mobile', 'phone_number'] },
  { key: 'contact_title', label: 'Contact title', aliases: ['contact_title', 'job_title', 'role', 'position', 'contact_role'] },
  { key: 'contacts', label: 'More contacts', aliases: ['contacts', 'new_contacts', 'additional_contacts', 'people', 'other_contacts', 'more_contacts'] },
];

export const NOTES_LOADER_FIELD_KEYS = NOTES_LOADER_COLUMNS.map((c) => c.key);

/** Column order used for the downloadable template and for headerless sheets. */
export const NOTES_LOADER_TEMPLATE_HEADERS = [
  'website',
  'note',
  'contact_method',
  'made_contact',
  'note_date',
  'remind_at',
  'status',
  'contact_name',
  'contact_email',
  'contact_phone',
  'contact_title',
  'contacts',
];

export const NOTES_LOADER_TEMPLATE_EXAMPLE_ROWS = [
  {
    website: 'https://www.acmeplumbing.com',
    note: 'Called the office, spoke with Pat. They use 2 subs for overflow and want pricing before the busy season.',
    contact_method: 'call',
    made_contact: 'yes',
    note_date: '2026-10-13',
    remind_at: '2026-10-20',
    status: 'contacted',
    contact_name: 'Pat Rivera',
    contact_email: 'pat@acmeplumbing.com',
    contact_phone: '(555) 200-3000',
    contact_title: 'Office Manager',
    contacts: '',
  },
  {
    website: 'betahvac.com',
    note: 'Left a voicemail. Website lists a new service manager.',
    contact_method: 'call',
    made_contact: 'no',
    note_date: '2026-10-13',
    remind_at: '',
    status: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    contact_title: '',
    contacts: 'Lee Park, Service Manager - lee@betahvac.com (555) 200-3001; Dana Fox dana@betahvac.com',
  },
];

export const NOTES_LOADER_CHATGPT_PROMPT = `Compile my sales notes into a spreadsheet I can upload to my CRM.
Use exactly these column headers in row 1:
website, note, contact_method, made_contact, note_date, remind_at, status, contact_name, contact_email, contact_phone, contact_title, contacts

Rules:
- website: the company's website URL (this is how the CRM finds the company). One row per note.
- note: what happened, in my words, cleaned up.
- contact_method: one of call, text, email, in_person, note.
- made_contact: yes or no (did I actually reach someone?).
- note_date: date of the conversation (YYYY-MM-DD). remind_at: when to follow up (YYYY-MM-DD), or blank.
- status: only if the company's stage changed. One of: ${CRM_STATUSES.join(', ')}. Otherwise blank.
- contact_name / contact_email / contact_phone / contact_title: a NEW person I met at that company, if any.
- contacts: any additional new people, separated by semicolons, like "Name, Title - email phone".
Return it as an .xlsx file.`;

const CONTACT_METHOD_ALIASES = {
  call: 'call', called: 'call', phone: 'call', 'phone call': 'call', voicemail: 'call', vm: 'call',
  text: 'text', sms: 'text', texted: 'text', message: 'text',
  email: 'email', emailed: 'email', 'e-mail': 'email', mail: 'email',
  in_person: 'in_person', 'in person': 'in_person', 'in-person': 'in_person', visit: 'in_person',
  visited: 'in_person', 'walk in': 'in_person', 'walk-in': 'in_person', meeting: 'in_person',
  'site visit': 'in_person', 'stopped by': 'in_person',
  note: 'note', notes: 'note', general: 'note', other: 'note', research: 'note',
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}(?:\s*(?:x|ext\.?|extension)\s*\d+)?/i;

export const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const websiteKey = (value) => {
  let key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  key = key.replace(/^https?:\/\//, '').replace(/^\/\//, '').replace(/^www\./, '');
  key = key.split(/[/?#]/)[0] || '';
  if (key.includes('@')) key = key.split('@').pop();
  return key.replace(/:\d+$/, '').replace(/\.$/, '');
};

export const humanizeDomain = (value) => {
  const host = websiteKey(value);
  if (!host) return '';
  const label = host.split('.')[0] || '';
  return label
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export const normalizeContactMethod = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return '';
  if (CONTACT_METHOD_ALIASES[key]) return CONTACT_METHOD_ALIASES[key];
  return CRM_NOTE_CONTACT_METHODS.includes(key) ? key : '';
};

export const normalizeYesNo = (value) => {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return '';
  if (['true', 'yes', 'y', '1', 'x', 'reached', 'connected', 'spoke'].includes(key)) return 'yes';
  if (['false', 'no', 'n', '0', 'none'].includes(key)) return 'no';
  return '';
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Dates from spreadsheets become ISO strings; midnight-only dates stay as YYYY-MM-DD. */
export const cellToString = (value) => {
  if (value == null) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const date = `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    const hasTime = value.getHours() || value.getMinutes() || value.getSeconds();
    return hasTime ? `${date} ${pad2(value.getHours())}:${pad2(value.getMinutes())}` : date;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
};

export const parseFreeFormContacts = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n|;/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const email = (chunk.match(EMAIL_RE) || [''])[0];
      let rest = email ? chunk.replace(email, ' ') : chunk;
      const phone = (rest.match(PHONE_RE) || [''])[0];
      if (phone) rest = rest.replace(phone, ' ');
      rest = rest
        .replace(/\b(email|e-mail|phone|cell|mobile|tel)\s*[:=]/gi, ' ')
        .replace(/[()<>[\]|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[,\-–—:]+|[,\-–—:]+$/g, '')
        .trim();
      let name = rest;
      let job_title = '';
      if (rest) {
        const parts = rest.split(/\s*(?:,|\s[-–—]\s)\s*/).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          name = parts[0];
          job_title = parts.slice(1).join(', ');
        }
      }
      if (!name && !email && !phone) return null;
      return { name, email, phone: phone.trim(), job_title };
    })
    .filter(Boolean);
};

/** Every contact a row would add: the structured columns plus the free-form `contacts` cell. */
export const contactsFromRow = (row) => {
  const out = [];
  const structured = {
    name: String(row.contact_name || '').trim(),
    email: String(row.contact_email || '').trim(),
    phone: String(row.contact_phone || '').trim(),
    job_title: String(row.contact_title || '').trim(),
  };
  if (structured.name || structured.email || structured.phone) out.push(structured);
  return out.concat(parseFreeFormContacts(row.contacts));
};

export const mapHeaderRow = (headerCells) => {
  const mapping = {};
  const used = new Set();
  const unmapped = [];
  headerCells.forEach((cell, idx) => {
    const header = normalizeHeader(cell);
    if (!header) return;
    const column = NOTES_LOADER_COLUMNS.find((c) => !used.has(c.key) && (c.key === header || c.aliases.includes(header)));
    if (column) {
      mapping[idx] = column.key;
      used.add(column.key);
    } else {
      unmapped.push(String(cell).trim());
    }
  });
  return { mapping, unmapped, mappedKeys: Array.from(used) };
};

const isHeaderRow = (mappedKeys) => mappedKeys.includes('website') || mappedKeys.includes('note');

export const normalizeNotesLoaderRow = (raw, rowNum) => {
  const row = { _rowNum: rowNum, _errors: [], _warnings: [] };
  NOTES_LOADER_FIELD_KEYS.forEach((key) => {
    row[key] = cellToString(raw[key]);
  });

  if (row.website && !row.website.includes('.') && !row.company_name) {
    // A bare word in the URL column is more likely a company name than a domain.
    row.company_name = row.website;
    row.website = '';
  }
  const rawMethod = row.contact_method;
  row.contact_method = normalizeContactMethod(rawMethod);
  if (rawMethod && !row.contact_method) row._warnings.push(`Unknown method "${rawMethod}" will be saved as a general note`);

  const rawReached = row.made_contact;
  row.made_contact = normalizeYesNo(rawReached);
  if (rawReached && !row.made_contact) row._warnings.push(`Could not read made_contact "${rawReached}"`);

  row.status = row.status.toLowerCase();
  if (row.status && !CRM_STATUSES.includes(row.status)) {
    row._warnings.push(`Unknown status "${row.status}" will be ignored`);
  }
  if (row.contact_phone) row.contact_phone = formatPhoneInput(row.contact_phone);
  if (row.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact_email)) {
    row._errors.push('Invalid contact email');
  }

  const hasContacts = contactsFromRow(row).length > 0;
  const hasStatus = Boolean(row.status) && CRM_STATUSES.includes(row.status);
  if (!row.website && !row.company_name) row._errors.push('Missing company URL');
  if (!row.note && !hasContacts && !hasStatus) row._errors.push('Nothing to add (no note, contact, or status)');
  return row;
};

/**
 * @param {Array<Array<any>>} rows2d raw sheet rows (first row is usually the header)
 * @returns {{ rows: object[], headerDetected: boolean, unmappedHeaders: string[], mappedKeys: string[] }}
 */
export const buildNotesLoaderDraftRows = (rows2d) => {
  const sheet = (rows2d || []).filter((cells) => Array.isArray(cells) && cells.some((c) => cellToString(c) !== ''));
  if (!sheet.length) return { rows: [], headerDetected: false, unmappedHeaders: [], mappedKeys: [] };

  const headerAttempt = mapHeaderRow(sheet[0]);
  const headerDetected = isHeaderRow(headerAttempt.mappedKeys);
  const mapping = headerDetected
    ? headerAttempt.mapping
    : Object.fromEntries(NOTES_LOADER_TEMPLATE_HEADERS.map((key, idx) => [idx, key]));
  const dataRows = headerDetected ? sheet.slice(1) : sheet;

  const rows = dataRows.map((cells, idx) => {
    const raw = {};
    Object.entries(mapping).forEach(([colIdx, key]) => {
      raw[key] = cells[Number(colIdx)];
    });
    return normalizeNotesLoaderRow(raw, idx + 1 + (headerDetected ? 1 : 0));
  });

  return {
    rows,
    headerDetected,
    unmappedHeaders: headerDetected ? headerAttempt.unmapped : [],
    mappedKeys: headerDetected ? headerAttempt.mappedKeys : NOTES_LOADER_TEMPLATE_HEADERS.slice(0, (sheet[0] || []).length),
  };
};

/** Client-side preview of which CRM company each row will hit; mirrors the server's matching. */
export const matchRowsToLeads = (rows, leads) => {
  const byWebsite = new Map();
  const byName = new Map();
  (leads || []).forEach((lead) => {
    const wk = websiteKey(lead.website);
    if (wk) byWebsite.set(wk, [...(byWebsite.get(wk) || []), lead]);
    const nk = String(lead.name || '').trim().toLowerCase();
    if (nk) byName.set(nk, [...(byName.get(nk) || []), lead]);
  });

  const createdInBatch = new Map();

  return rows.map((row) => {
    const wk = websiteKey(row.website);
    const nk = String(row.company_name || '').trim().toLowerCase();
    let match = null;

    if (wk) {
      if (createdInBatch.has(wk)) {
        match = { status: 'new_in_batch', leadId: null, leadName: createdInBatch.get(wk), via: 'url' };
      } else {
        const hits = byWebsite.get(wk) || [];
        if (hits.length === 1) match = { status: 'matched', leadId: hits[0].id, leadName: hits[0].name, via: 'url' };
        else if (hits.length > 1) {
          const narrowed = nk ? hits.filter((l) => String(l.name || '').trim().toLowerCase() === nk) : [];
          if (narrowed.length === 1) match = { status: 'matched', leadId: narrowed[0].id, leadName: narrowed[0].name, via: 'url+name' };
          else match = { status: 'ambiguous', leadId: null, leadName: hits.map((l) => l.name).join(', '), via: 'url' };
        }
      }
    }

    if (!match && nk) {
      if (createdInBatch.has(`name:${nk}`)) {
        match = { status: 'new_in_batch', leadId: null, leadName: createdInBatch.get(`name:${nk}`), via: 'name' };
      } else {
        const hits = byName.get(nk) || [];
        if (hits.length === 1) match = { status: 'matched', leadId: hits[0].id, leadName: hits[0].name, via: 'name' };
        else if (hits.length > 1) match = { status: 'ambiguous', leadId: null, leadName: hits.map((l) => l.name).join(', '), via: 'name' };
      }
    }

    if (!match) {
      const newName = row.company_name || humanizeDomain(row.website);
      match = { status: 'missing', leadId: null, leadName: newName, via: null };
      if (wk) createdInBatch.set(wk, newName);
      if (nk) createdInBatch.set(`name:${nk}`, newName);
    }

    return { ...row, _match: match };
  });
};

export const toNotesLoaderSubmitRow = (row) => {
  const out = {};
  NOTES_LOADER_FIELD_KEYS.forEach((key) => {
    const value = row[key];
    if (value !== '' && value != null) out[key] = value;
  });
  return out;
};

export const summarizeNotesLoaderRows = (rows) =>
  rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row._errors?.length) acc.withErrors += 1;
      if (row._warnings?.length) acc.withWarnings += 1;
      const status = row._match?.status;
      if (status === 'matched') acc.matched += 1;
      else if (status === 'ambiguous') acc.ambiguous += 1;
      else if (status === 'missing' || status === 'new_in_batch') acc.missing += 1;
      if (row.note) acc.notes += 1;
      acc.contacts += contactsFromRow(row).length;
      return acc;
    },
    { total: 0, withErrors: 0, withWarnings: 0, matched: 0, ambiguous: 0, missing: 0, notes: 0, contacts: 0 },
  );

export const buildNotesLoaderTemplateRows = () => [
  NOTES_LOADER_TEMPLATE_HEADERS,
  ...NOTES_LOADER_TEMPLATE_EXAMPLE_ROWS.map((row) => NOTES_LOADER_TEMPLATE_HEADERS.map((key) => row[key] ?? '')),
];
