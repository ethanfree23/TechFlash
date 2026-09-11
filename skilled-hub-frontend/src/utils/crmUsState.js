import { US_STATES } from '../data/statesByCountry.js';

const US_STATE_BY_ABBR = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

/** Map free-text or 2-letter codes to a value in US_STATES (full name), or return trimmed raw if unknown */
export function normalizeToUsStateName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (US_STATES.includes(s)) return s;
  const up = s.toUpperCase();
  if (US_STATE_BY_ABBR[up]) return US_STATE_BY_ABBR[up];
  const lower = s.toLowerCase();
  const found = US_STATES.find((x) => x.toLowerCase() === lower);
  return found || s;
}

const US_ABBR_BY_NAME = Object.fromEntries(
  Object.entries(US_STATE_BY_ABBR).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

/** Map free-text or full name to a 2-letter US state code when possible. */
export function usStateAbbreviation(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const up = s.toUpperCase();
  if (US_STATE_BY_ABBR[up]) return up;
  return US_ABBR_BY_NAME[s.toLowerCase()] || '';
}
