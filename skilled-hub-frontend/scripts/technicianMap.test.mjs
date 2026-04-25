import assert from 'assert';
import {
  haversineMiles,
  filterJobsWithinRadius,
  needsTechnicianMapSetup,
} from '../src/utils/technicianMap.js';

function testHaversineMiles() {
  const d = haversineMiles(29.7604, -95.3698, 29.7604, -95.3698);
  assert.ok(d < 0.001, 'same coordinates should be near zero distance');
}

function testFilterJobsWithinRadius() {
  const jobs = [
    { id: 1, latitude: 29.7604, longitude: -95.3698, title: 'Houston' },
    { id: 2, latitude: 30.2672, longitude: -97.7431, title: 'Austin' },
    { id: 3, latitude: 32.7767, longitude: -96.7970, title: 'Dallas' },
  ];
  const filtered = filterJobsWithinRadius(jobs, 29.7604, -95.3698, 120);
  const ids = filtered.map((j) => j.id);

  assert.deepStrictEqual(ids, [1], '120-mile radius from Houston should only include Houston job');
  assert.ok(Number.isFinite(filtered[0].distanceMiles), 'distance should be attached to job rows');
}

function testFilterWithoutCoordinatesFallsBack() {
  const jobs = [{ id: 1 }, { id: 2 }];
  const filtered = filterJobsWithinRadius(jobs, null, null, 150);
  assert.strictEqual(filtered.length, 2, 'without center coordinates, do not filter jobs out');
}

function testNeedsTechnicianMapSetup() {
  assert.strictEqual(
    needsTechnicianMapSetup({
      address: '100 Main St',
      city: 'Houston',
      state: 'Texas',
      zip_code: '77002',
      country: 'United States',
      latitude: 29.7604,
      longitude: -95.3698,
    }),
    false
  );

  assert.strictEqual(
    needsTechnicianMapSetup({
      address: '',
      city: 'Houston',
      state: 'Texas',
      zip_code: '77002',
      country: 'United States',
      latitude: 29.7604,
      longitude: -95.3698,
    }),
    true
  );
}

function run() {
  testHaversineMiles();
  testFilterJobsWithinRadius();
  testFilterWithoutCoordinatesFallsBack();
  testNeedsTechnicianMapSetup();
  // eslint-disable-next-line no-console
  console.log('technician map tests passed');
}

run();
