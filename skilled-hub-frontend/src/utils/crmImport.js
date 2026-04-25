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

  const normalizedLines = normalizeRowsWithWrappedLines(content);
  const headerlessRows = normalizedLines.map((line) => parseCsv(line)[0] || []);
  const rows = mapRowsToObjects(headerlessRows, CRM_IMPORT_HEADERS);
  return rows.map((r, idx) => makeDraftRow(r, idx, statuses, companyTypes));
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
