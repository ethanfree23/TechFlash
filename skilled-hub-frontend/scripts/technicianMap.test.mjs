import assert from 'assert';
import {
  haversineMiles,
  filterJobsWithinRadius,
  needsExactStreetAddress,
  needsTechnicianMapSetup,
  zoomForMapWidthMiles,
  technicianHomeLatLng,
  resolveTechnicianMapCenter,
  US_DEFAULT_MAP_CENTER,
} from '../src/utils/technicianMap.js';
import {
  parseCoordinate,
  parseCoordinatePair,
  isValidCoordinatePair,
} from '../src/utils/coordinates.js';

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
    false
  );

  assert.strictEqual(
    needsTechnicianMapSetup({
      address: '',
      city: '',
      state: 'Texas',
      country: 'United States',
    }),
    true
  );

  assert.strictEqual(
    needsTechnicianMapSetup({
      address: '100 Main St',
      city: 'Houston',
      state: 'Texas',
      country: 'United States',
      latitude: null,
      longitude: null,
    }),
    true,
    'city/state/country without valid coordinates is not map-ready'
  );

  assert.strictEqual(
    needsTechnicianMapSetup({
      address: '100 Main St',
      city: 'Houston',
      state: 'Texas',
      country: 'United States',
      latitude: 0,
      longitude: 0,
    }),
    true,
    '0,0 is not map-ready'
  );
}

function testNeedsExactStreetAddress() {
  assert.strictEqual(
    needsExactStreetAddress({
      address: '',
      city: 'Houston',
      state: 'Texas',
      country: 'United States',
      latitude: 29.7604,
      longitude: -95.3698,
    }),
    true
  );

  assert.strictEqual(
    needsExactStreetAddress({
      address: '100 Main St',
      city: 'Houston',
      state: 'Texas',
      country: 'United States',
      latitude: 29.7604,
      longitude: -95.3698,
    }),
    false
  );

  assert.strictEqual(
    needsExactStreetAddress({
      address: '',
      city: '',
      state: 'Texas',
      country: 'United States',
    }),
    false
  );
}

function testZoomForFortyFiveMileDiameter() {
  const dallasLat = 32.7767;
  const z45 = zoomForMapWidthMiles(dallasLat, 800, 45);
  const z90 = zoomForMapWidthMiles(dallasLat, 800, 90);
  assert.ok(z45 != null && z45 > 10 && z45 < 11.2, `45-mile-wide zoom should be ~10.5, got ${z45}`);
  assert.ok(Math.abs(z45 - z90 - 1) < 0.05, 'doubling the visible diameter should drop zoom by 1');
  assert.strictEqual(zoomForMapWidthMiles(dallasLat, 0, 45), null);
  assert.ok(
    zoomForMapWidthMiles(dallasLat, 1200, 45) > z45,
    'a wider map pane needs a higher zoom to keep the same 45-mile width'
  );
}

function testNullCoordinatesDoNotBecomeZero() {
  assert.strictEqual(parseCoordinate(null), null);
  assert.strictEqual(parseCoordinate(undefined), null);
  assert.strictEqual(parseCoordinate(''), null);
  assert.strictEqual(parseCoordinate('   '), null);
  assert.ok(Number(null) === 0, 'sanity: Number(null) is 0, which is why we must not use it');
  assert.ok(Number('') === 0, 'sanity: Number("") is 0');
  assert.strictEqual(parseCoordinatePair(null, null), null);
  assert.strictEqual(parseCoordinatePair('', ''), null);
  assert.strictEqual(technicianHomeLatLng({ latitude: null, longitude: null, country: 'United States' }), null);
  assert.strictEqual(technicianHomeLatLng({ latitude: '', longitude: '', country: 'United States' }), null);
  assert.strictEqual(isValidCoordinatePair(null, null), false);
}

function testNumericStringsAndTexasCoordsAreValid() {
  const pair = parseCoordinatePair('30.123', '-95.456');
  assert.deepStrictEqual(pair, { lat: 30.123, lng: -95.456 });
  const home = technicianHomeLatLng({
    latitude: 30.3113,
    longitude: -95.456,
    country: 'United States',
  });
  assert.ok(home);
  assert.ok(Math.abs(home.lat - 30.3113) < 0.0001);
  assert.ok(Math.abs(home.lng - -95.456) < 0.0001);
}

function testZeroZeroIsInvalid() {
  assert.strictEqual(parseCoordinatePair(0, 0), null);
  assert.strictEqual(parseCoordinatePair(0.01, 0.01), null);
  assert.strictEqual(technicianHomeLatLng({ latitude: 0, longitude: 0, country: 'United States' }), null);
  assert.strictEqual(isValidCoordinatePair(0, 0), false);
}

function testInvalidHomeFallsThroughToMapFallback() {
  const conroe = { lat: 30.3113, lng: -95.456 };
  const selected = resolveTechnicianMapCenter({
    homeLatLng: technicianHomeLatLng({ latitude: null, longitude: null }),
    selectedLatLng: conroe,
  });
  assert.deepStrictEqual(selected, { center: conroe, source: 'selected_job' });

  const fit = resolveTechnicianMapCenter({
    homeLatLng: null,
    selectedLatLng: null,
    jobPositions: [conroe],
  });
  assert.deepStrictEqual(fit, { center: null, source: 'fit' });

  const fallback = resolveTechnicianMapCenter({
    homeLatLng: technicianHomeLatLng({ latitude: 0, longitude: 0 }),
    selectedLatLng: null,
    jobPositions: [],
    presencePositions: [],
  });
  assert.deepStrictEqual(fallback, { center: US_DEFAULT_MAP_CENTER, source: 'default' });

  const validHome = resolveTechnicianMapCenter({
    homeLatLng: technicianHomeLatLng({ latitude: 30.3113, longitude: -95.456, country: 'United States' }),
    selectedLatLng: { lat: 29.76, lng: -95.36 },
  });
  assert.strictEqual(validHome.source, 'home');
  assert.ok(Math.abs(validHome.center.lat - 30.3113) < 0.0001);
}

function run() {
  testHaversineMiles();
  testFilterJobsWithinRadius();
  testFilterWithoutCoordinatesFallsBack();
  testNeedsTechnicianMapSetup();
  testNeedsExactStreetAddress();
  testZoomForFortyFiveMileDiameter();
  testNullCoordinatesDoNotBecomeZero();
  testNumericStringsAndTexasCoordsAreValid();
  testZeroZeroIsInvalid();
  testInvalidHomeFallsThroughToMapFallback();
  console.log('technician map tests passed');
}

run();
