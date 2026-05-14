import { US_STATES } from '../data/statesByCountry';
import { normalizeToUsStateName } from './crmUsState';

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

  let zip = '';
  let last = parts[parts.length - 1];
  const zipMatch = last.match(/\b(\d{5})(-\d{4})?\s*$/);
  if (zipMatch) {
    zip = zipMatch[1] + (zipMatch[2] || '');
    last = last.slice(0, zipMatch.index).trim();
    parts = last ? [...parts.slice(0, -1), last] : parts.slice(0, -1);
  }

  let state = '';
  if (parts.length) {
    const tail = parts[parts.length - 1];
    const normalized = normalizeToUsStateName(tail);
    const looksLikeState =
      tail.length === 2 ||
      US_STATES.includes(tail) ||
      (normalized && US_STATES.includes(normalized));

    if (looksLikeState && normalized) {
      state = normalized;
      parts = parts.slice(0, -1);
    }
  }

  let city = '';
  let street_address = '';
  if (parts.length >= 2) {
    city = parts[parts.length - 1];
    street_address = parts.slice(0, -1).join(', ');
  } else if (parts.length === 1) {
    street_address = parts[0];
  }

  return { street_address, city, state, zip };
}
