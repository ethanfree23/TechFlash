import { US_STATES } from '../data/statesByCountry.js';
import { normalizeToUsStateName, usStateAbbreviation } from './crmUsState.js';

const US_COUNTRY_TOKENS = new Set([
  'united states',
  'united states of america',
  'usa',
  'u.s.a.',
  'u.s.a',
  'u.s.',
  'us',
]);

function isUsCountryToken(part) {
  const t = String(part || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '');
  return US_COUNTRY_TOKENS.has(t) || US_COUNTRY_TOKENS.has(String(part || '').trim().toLowerCase());
}

export function stripCountryFromAddress(text) {
  const parts = String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  while (parts.length && isUsCountryToken(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(', ');
}

export function parseCityState(text) {
  const cleaned = stripCountryFromAddress(text);
  if (!cleaned) return { city: '', state: '' };

  if (!cleaned.includes(',')) {
    const abbr = usStateAbbreviation(cleaned);
    const name = normalizeToUsStateName(cleaned);
    if (abbr && (cleaned.length === 2 || US_STATES.includes(name))) {
      return { city: '', state: abbr };
    }
    return { city: cleaned, state: '' };
  }

  const m = cleaned.match(/^(.+),\s*([^,]+)$/);
  if (m) {
    const city = m[1].trim();
    const statePart = m[2].replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
    const abbr = usStateAbbreviation(statePart);
    if (abbr) return { city, state: abbr };
  }

  return { city: cleaned, state: '' };
}

export function formatUsAddress({ address, city, state, zip } = {}) {
  return [address, city, state, zip].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
}

export function usZip5(value) {
  const m = String(value || '').match(/\b(\d{5})\b/);
  return m ? m[1] : '';
}
