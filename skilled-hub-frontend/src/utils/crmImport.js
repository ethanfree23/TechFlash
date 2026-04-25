import { formatPhoneInput } from './phone.js';

export const CRM_IMPORT_HEADERS = ['name', 'contact_name', 'email', 'phone', 'website', 'company_types', 'status', 'notes'];

export const countCommas = (value) => (String(value || '').match(/,/g) || []).length;

export const parseCsv = (text) => {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += ch;
  }
  row.push(current);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
};

const cleanLooseValue = (value) => String(value || '').trim().replace(/^['"`]+|['"`]+$/g, '');

const inferCompanyTypeTokens = (text, companyTypes) => {
  const haystack = String(text || '').toLowerCase();
  return companyTypes.filter((type) => haystack.includes(type.replace(/_/g, ' ')));
};

const COMPANY_NAME_HINT_RE = /\b(llc|inc|corp|co\.?|company|electric|plumbing|hvac|services|solutions|mechanical|contracting)\b/i;
const NON_COMPANY_LINE_RE = /^(cell|phone|mobile|email|e-?mail|tel|fax|address|city|state|zip|tecl)\b/i;

const looksLikePersonName = (value) => {
  const name = cleanLooseValue(value);
  if (!name) return false;
  if (name.length < 4 || name.length > 60) return false;
  if (/\d/.test(name)) return false;
  if (/@|https?:\/\//i.test(name)) return false;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[A-Z][a-z.'-]+$/.test(word));
};

const uniqueValues = (values) => Array.from(new Set(values.map((v) => cleanLooseValue(v)).filter(Boolean)));

const extractNameFromLine = (value) => {
  const raw = cleanLooseValue(value);
  if (!raw) return '';
  const primary = raw.split(',')[0].trim();
  return looksLikePersonName(primary) ? primary : '';
};

const toTitleCase = (value) =>
  String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const inferCompanyNameFromEmailDomain = (emails) => {
  const firstEmail = emails.find(Boolean);
  if (!firstEmail || !firstEmail.includes('@')) return '';
  const domain = firstEmail.split('@')[1].toLowerCase();
  const host = domain.split('.')[0];
  if (!host) return '';
  const expanded = host
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .replace(/(\d)([a-z])/gi, '$1 $2');
  const spaced = expanded
    .replace(/electrical/g, ' electrical')
    .replace(/services/g, ' services')
    .replace(/solutions/g, ' solutions')
    .replace(/contracting/g, ' contracting')
    .replace(/plumbing/g, ' plumbing')
    .replace(/hvac/g, ' hvac')
    .replace(/mechanical/g, ' mechanical')
    .replace(/\s+/g, ' ')
    .trim();
  return toTitleCase(spaced || host);
};

const looksLikeStreetAddress = (line) => /^\d+\s+[A-Za-z0-9.'# -]+$/.test(cleanLooseValue(line));
const looksLikeCityStateZip = (line) => /^[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(cleanLooseValue(line));

const extractExplicitCompanyName = (lines) =>
  lines.find((line) => {
    const value = cleanLooseValue(line);
    if (!value) return false;
    if (extractNameFromLine(value)) return false;
    if (/@|https?:\/\//i.test(value)) return false;
    if (NON_COMPANY_LINE_RE.test(value.toLowerCase())) return false;
    if (looksLikeStreetAddress(value) || looksLikeCityStateZip(value)) return false;
    return COMPANY_NAME_HINT_RE.test(value);
  }) || '';

const findContactEmailAndPhone = (line, lines, startIdx) => {
  const searchWindow = [line, ...lines.slice(startIdx + 1, startIdx + 5)].join(' ');
  const emailMatch = searchWindow.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = searchWindow.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/);
  return {
    email: cleanLooseValue(emailMatch ? emailMatch[0] : ''),
    phone: cleanLooseValue(phoneMatch ? phoneMatch[0] : ''),
  };
};

const inferMultipleImportRowsFromUnstructuredText = (text, statuses = [], companyTypes = []) => {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const fullText = lines.join(' ');
  const emails = uniqueValues(fullText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
  const explicitCompanyName = cleanLooseValue(extractExplicitCompanyName(lines));
  const sharedCompanyName = explicitCompanyName || inferCompanyNameFromEmailDomain(emails);
  const inferredTypes = inferCompanyTypeTokens(fullText, companyTypes);

  const contacts = [];
  lines.forEach((line, idx) => {
    const contactName = extractNameFromLine(line);
    if (!contactName) return;
    const { email, phone } = findContactEmailAndPhone(line, lines, idx);
    if (!email && !phone) return;
    contacts.push({
      name: sharedCompanyName,
      contact_name: contactName,
      email,
      phone: formatPhoneInput(phone),
      website: '',
      company_types: inferredTypes.join('|'),
      status: statuses.includes('lead') ? 'lead' : statuses[0] || 'lead',
      notes: '',
    });
  });

  return contacts.filter((row) => row.name && row.contact_name && (row.email || row.phone));
};

export const inferSingleImportRowFromUnstructuredText = (text, statuses = [], companyTypes = [], options = {}) => {
  const raw = String(text || '').trim();
  const includeDiagnostics = Boolean(options.includeDiagnostics);
  if (!raw) return includeDiagnostics ? { row: null, diagnostics: { confidence: 'low', warnings: ['No text provided'] } } : null;
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return includeDiagnostics ? { row: null, diagnostics: { confidence: 'low', warnings: ['No readable lines found'] } } : null;
  }

  const labeled = {};
  lines.forEach((line) => {
    const m = line.match(/^([a-zA-Z _-]{2,40})\s*[:=-]\s*(.+)$/);
    if (!m) return;
    labeled[m[1].trim().toLowerCase()] = cleanLooseValue(m[2]);
  });

  const fullText = lines.join(' ');
  const emails = uniqueValues(fullText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
  const websites = uniqueValues(fullText.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s,;)]*)?/gi) || []);
  const phones = uniqueValues(fullText.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/g) || []);

  const pickLabel = (keys) => {
    const key = Object.keys(labeled).find((k) => keys.some((needle) => k.includes(needle)));
    return key ? labeled[key] : '';
  };

  const statusCandidate = cleanLooseValue(pickLabel(['status', 'stage'])).toLowerCase();
  const inferredTypes = inferCompanyTypeTokens(fullText, companyTypes);

  const companyNameLabeled = pickLabel(['company', 'business', 'organization', 'org']);
  const contactNameLabeled = pickLabel(['contact', 'owner', 'person', 'name']);
  const notesLabeled = pickLabel(['note', 'details', 'summary', 'context']);
  const websiteValue = cleanLooseValue(pickLabel(['website', 'site', 'url'])) || websites[0] || '';
  const emailValue = cleanLooseValue(pickLabel(['email', 'mail'])) || emails[0] || '';
  const phoneValue = cleanLooseValue(pickLabel(['phone', 'mobile', 'cell', 'tel'])) || phones[0] || '';

  const firstLine = lines[0] || '';
  const secondLine = lines[1] || '';
  const likelyPersonLine = lines.find((line) => looksLikePersonName(line));
  const likelyCompanyLine = lines.find((line) => COMPANY_NAME_HINT_RE.test(line) && !looksLikePersonName(line));
  const companyName =
    cleanLooseValue(companyNameLabeled) ||
    cleanLooseValue(likelyCompanyLine) ||
    (firstLine.toLowerCase().includes('contact') && secondLine ? cleanLooseValue(secondLine) : cleanLooseValue(firstLine));
  const contactName = cleanLooseValue(contactNameLabeled || likelyPersonLine);

  const notesFromLeftovers = lines
    .filter((line) => !/^([a-zA-Z _-]{2,40})\s*[:=-]\s*(.+)$/.test(line))
    .slice(1)
    .join(' ');

  const additionalInfo = [];
  if (emails.length > 1) additionalInfo.push(`Additional emails: ${emails.slice(1).join(', ')}`);
  if (phones.length > 1) additionalInfo.push(`Additional phones: ${phones.slice(1).join(', ')}`);
  if (websites.length > 1) additionalInfo.push(`Additional websites: ${websites.slice(1).join(', ')}`);
  const combinedNotes = [cleanLooseValue(notesLabeled || notesFromLeftovers), ...additionalInfo].filter(Boolean).join('\n');

  const row = {
    name: companyName,
    contact_name: contactName,
    email: emailValue,
    phone: formatPhoneInput(phoneValue),
    website: websiteValue,
    company_types: inferredTypes.join('|'),
    status: statuses.includes(statusCandidate) ? statusCandidate : 'lead',
    notes: combinedNotes,
  };

  const warnings = [];
  if (!row.name) warnings.push('Could not confidently identify company name');
  if (!row.contact_name) warnings.push('Could not confidently identify contact name');
  if (!row.email && !row.phone) warnings.push('No clear email or phone detected');
  if (emails.length > 1 || phones.length > 1 || websites.length > 1) warnings.push('Multiple values found; extras added to notes');
  const confidence = warnings.length <= 1 ? 'high' : warnings.length <= 3 ? 'medium' : 'low';

  if (!row.name) {
    return includeDiagnostics ? { row: null, diagnostics: { confidence, warnings } } : null;
  }
  return includeDiagnostics ? { row, diagnostics: { confidence, warnings } } : row;
};

export const normalizeRowsWithWrappedLines = (rawText) => {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const expectedCommas = CRM_IMPORT_HEADERS.length - 1;
  const normalized = [];
  let pending = '';

  lines.forEach((line) => {
    if (!pending) {
      pending = line;
      return;
    }

    const pendingCommas = countCommas(pending);
    const shouldAppend =
      pendingCommas < expectedCommas ||
      line.startsWith(',') ||
      countCommas(line) === 0;

    if (shouldAppend) {
      pending += line.startsWith(',') ? line : ` ${line}`;
      return;
    }

    normalized.push(pending);
    pending = line;
  });

  if (pending) normalized.push(pending);
  return normalized;
};

export const mapRowsToObjects = (rows, headers) =>
  rows
    .map((cells) => {
      const rowObj = {};
      headers.forEach((header, idx) => {
        rowObj[header] = (cells[idx] || '').trim();
      });
      return rowObj;
    })
    .filter((rowObj) => rowObj.name);

export const normalizeImportRow = (row) => {
  const normalized = {
    name: (row.name || '').trim(),
    contact_name: (row.contact_name || '').trim(),
    email: (row.email || '').trim(),
    phone: formatPhoneInput((row.phone || '').trim()),
    website: (row.website || '').trim(),
    company_types: (row.company_types || '').trim(),
    status: (row.status || 'lead').trim().toLowerCase() || 'lead',
    notes: (row.notes || '').trim(),
  };

  if (normalized.website && !/^https?:\/\//i.test(normalized.website)) {
    normalized.website = `https://${normalized.website}`;
  }

  return normalized;
};

export const validateImportRow = (row, statuses, companyTypes) => {
  const errors = [];
  if (!row.name) errors.push('Missing company name');
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Invalid email');
  if (row.status && !statuses.includes(row.status)) errors.push('Invalid status');

  if (row.company_types) {
    const types = row.company_types.split(/[,|;]/).map((v) => v.trim().toLowerCase()).filter(Boolean);
    const invalid = types.filter((t) => !companyTypes.includes(t));
    if (invalid.length) errors.push(`Invalid company_types: ${invalid.join(', ')}`);
  }

  return errors;
};

export const makeDraftRow = (row, index, statuses, companyTypes) => {
  const normalized = normalizeImportRow(row);
  return {
    ...normalized,
    _rowNum: index + 1,
    _errors: validateImportRow(normalized, statuses, companyTypes),
  };
};

export const buildImportDraftRows = (content, statuses, companyTypes) => {
  const parsed = parseCsv(content);
  if (parsed.length < 1) return [];

  const headers = parsed[0].map((h) => h.trim().toLowerCase());
  const hasHeader = CRM_IMPORT_HEADERS.every((h) => headers.includes(h));

  if (hasHeader) {
    const rows = mapRowsToObjects(parsed.slice(1), headers);
    return rows.map((r, idx) => makeDraftRow(r, idx, statuses, companyTypes));
  }

  const rawLines = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const likelyContactLineCount = rawLines.filter((line) => extractNameFromLine(line)).length;
  const emailCount = (String(content || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length;
  const hasCsvishLine = rawLines.some((line) => countCommas(line) >= 3);
  if (likelyContactLineCount >= 2 && emailCount >= 2 && !hasCsvishLine) {
    const inferredMultiple = inferMultipleImportRowsFromUnstructuredText(content, statuses, companyTypes);
    if (inferredMultiple.length > 1) {
      return inferredMultiple.map((row, idx) => makeDraftRow(row, idx, statuses, companyTypes));
    }
  }

  const normalizedLines = normalizeRowsWithWrappedLines(content);
  const headerlessRows = normalizedLines.map((line) => parseCsv(line)[0] || []);
  const rows = mapRowsToObjects(headerlessRows, CRM_IMPORT_HEADERS);
  if (rows.length > 0) {
    return rows.map((r, idx) => makeDraftRow(r, idx, statuses, companyTypes));
  }

  const inferred = inferSingleImportRowFromUnstructuredText(content, statuses, companyTypes);
  if (!inferred) return [];
  return [makeDraftRow(inferred, 0, statuses, companyTypes)];
};

export const autoFixDraftRows = (rows, statuses, companyTypes) =>
  rows.map((row) => {
    const status = statuses.includes((row.status || '').toLowerCase()) ? row.status.toLowerCase() : 'lead';
    const parsedTypes = (row.company_types || '')
      .split(/[,|;]/)
      .map((v) => v.trim().toLowerCase())
      .filter((v) => companyTypes.includes(v));
    const next = makeDraftRow(
      {
        ...row,
        status,
        company_types: parsedTypes.join('|'),
      },
      row._rowNum - 1,
      statuses,
      companyTypes,
    );
    return { ...next, _rowNum: row._rowNum };
  });
