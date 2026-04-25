import assert from 'assert';
import { TECHFLASH_LOGO_NAV, TECHFLASH_LOGO_LOGIN } from '../src/constants/branding.js';
import { EXPERIENCE_ANY, EXPERIENCE_YEAR_OPTIONS, formatExperienceShort, formatExperienceLong } from '../src/constants/experienceSelect.js';
import { COUNTRIES } from '../src/data/countries.js';
import { US_STATES, BR_STATES, getStatesForCountry } from '../src/data/statesByCountry.js';

function testBrandingConstants() {
  assert.ok(TECHFLASH_LOGO_NAV.includes('techflash-logo.png'), 'nav logo path should include file name');
  assert.ok(TECHFLASH_LOGO_LOGIN.includes('techflash-logo-login.png'), 'login logo path should include file name');
}

function testExperienceOptions() {
  assert.strictEqual(EXPERIENCE_ANY, '');
  assert.strictEqual(EXPERIENCE_YEAR_OPTIONS[0].label, 'Any');
  assert.strictEqual(EXPERIENCE_YEAR_OPTIONS[EXPERIENCE_YEAR_OPTIONS.length - 1].label, '50+ years');
  assert.strictEqual(formatExperienceShort(50), '50+');
  assert.strictEqual(formatExperienceShort(3), '3+');
  assert.strictEqual(formatExperienceLong(50), '50+ years');
  assert.strictEqual(formatExperienceLong(3), '3+ years');
}

function testCountryData() {
  assert.ok(Array.isArray(COUNTRIES) && COUNTRIES.length > 100, 'countries list should be populated');
  assert.strictEqual(COUNTRIES[0].code, 'US', 'US should be first');
  const codeSet = new Set(COUNTRIES.map((c) => c.code));
  assert.strictEqual(codeSet.size, COUNTRIES.length, 'country codes should be unique');
}

function testStatesData() {
  assert.strictEqual(US_STATES.length, 51, 'US states should include 50 states + DC');
  assert.strictEqual(BR_STATES.length, 27, 'Brazil should have 27 federal units');
  assert.ok(getStatesForCountry('US').includes('Texas'));
  assert.ok(getStatesForCountry('br').includes('São Paulo'));
  assert.deepStrictEqual(getStatesForCountry('ZZ'), [], 'unknown country should return empty list');
}

function run() {
  testBrandingConstants();
  testExperienceOptions();
  testCountryData();
  testStatesData();
  // eslint-disable-next-line no-console
  console.log('data/constants tests passed');
}

run();
