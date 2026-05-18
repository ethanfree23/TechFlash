import { US_STATES } from '../data/statesByCountry';
import { normalizeToUsStateName } from './crmUsState';

const US_COUNTRY_TOKENS = new Set([
  'united states',
  'united states of america',
  'usa',
  'u.s.a.',
  'u.s.a',
  'us',
]);

function isUsCountryToken(part) {
  const t = String(part || '').trim().toLowerCase().replace(/\./g, '');
  return US_COUNTRY_TOKENS.has(t);
}

function stripTrailingUsCountry(parts) {
  let next = [...parts];
  while (next.length && isUsCountryToken(next[next.length - 1])) {
    next = next.slice(0, -1);
  }
  return next;
}

/** Split "Austin, TX" or "Austin TX" into city + state when possible. */
function splitCityStateSegment(segment) {
  const raw = String(segment || '').trim();
  if (!raw) return { city: '', state: '' };

  const commaMatch = raw.match(/^(.+?),\s*([A-Za-z]{2}|[A-Za-z][A-Za-z\s.]+)$/);
  if (commaMatch) {
    const city = commaMatch[1].trim();
    const stateRaw = commaMatch[2].trim();
    const normalized = normalizeToUsStateName(stateRaw);
    if (normalized && (stateRaw.length === 2 || US_STATES.includes(normalized))) {
      return { city, state: normalized };
    }
  }

  const spaceMatch = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (spaceMatch) {
    const city = spaceMatch[1].trim();
    const stateRaw = spaceMatch[2].trim();
    const normalized = normalizeToUsStateName(stateRaw);
    if (normalized && (stateRaw.length === 2 || US_STATES.includes(normalized))) {
      return { city, state: normalized };
    }
  }

  return { city: '', state: '' };
}

function detectStateFromTail(parts) {
  if (!parts.length) return { state: '', parts };

  const tail = parts[parts.length - 1];
  if (isUsCountryToken(tail)) {
    return { state: '', parts: parts.slice(0, -1) };
  }

  const split = splitCityStateSegment(tail);
  if (split.state) {
    const before = parts.slice(0, -1);
    if (split.city) {
      return { state: split.state, parts: [...before, split.city] };
    }
    return { state: split.state, parts: before };
  }

  const normalized = normalizeToUsStateName(tail);
  const looksLikeState =
    tail.length === 2 ||
    US_STATES.includes(tail) ||
    (normalized && US_STATES.includes(normalized));

  if (looksLikeState && normalized) {
    return { state: normalized, parts: parts.slice(0, -1) };
  }

  return { state: '', parts };
}

/**
 * Best-effort parse of a pasted US-style address into CRM fields.
 * Supports comma-separated lines and multi-line pastes (street, then city/state/zip).
 */
export function parseUsAddressPaste(raw) {
  const empty = { street_address: '', city: '', state: '', zip: '' };
  const text = String(raw || '').trim();
  if (!text) return empty;

  let parts = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (!parts.length) return empty;

  parts = stripTrailingUsCountry(parts);

  let zip = '';
  let last = parts[parts.length - 1];
  const zipMatch = last.match(/\b(\d{5})(-\d{4})?\s*$/);
  if (zipMatch) {
    zip = zipMatch[1] + (zipMatch[2] || '');
    last = last.slice(0, zipMatch.index).trim();
    parts = last ? [...parts.slice(0, -1), last] : parts.slice(0, -1);
  }

  parts = stripTrailingUsCountry(parts);

  const { state, parts: afterState } = detectStateFromTail(parts);

  let city = '';
  let street_address = '';
  if (afterState.length >= 2) {
    city = afterState[afterState.length - 1];
    street_address = afterState.slice(0, -1).join(', ');
  } else if (afterState.length === 1) {
    street_address = afterState[0];
  }

  return { street_address, city, state, zip };
}
