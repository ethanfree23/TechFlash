import assert from 'assert';
import {
  parseCoordinate,
  parseCoordinatePair,
  isValidCoordinatePair,
  isValidUSTechnicianCoordinates,
  technicianHomeLatLng,
} from '../src/utils/coordinates.js';

function testNullAndEmptyDoNotBecomeZero() {
  assert.strictEqual(parseCoordinate(null), null);
  assert.strictEqual(parseCoordinate(undefined), null);
  assert.strictEqual(parseCoordinate(''), null);
  assert.strictEqual(parseCoordinate('   '), null);
  assert.strictEqual(parseCoordinatePair(null, null), null);
  assert.strictEqual(parseCoordinatePair('', ''), null);
  assert.strictEqual(isValidCoordinatePair(null, null), false);
  assert.ok(Number(null) === 0);
  assert.ok(Number('') === 0);
}

function testNumericStrings() {
  assert.deepStrictEqual(parseCoordinatePair('30.123', '-95.456'), { lat: 30.123, lng: -95.456 });
  assert.strictEqual(isValidCoordinatePair('30.123', '-95.456'), true);
}

function testZeroZeroInvalid() {
  assert.strictEqual(parseCoordinatePair(0, 0), null);
  assert.strictEqual(isValidCoordinatePair(0, 0), false);
  assert.strictEqual(isValidCoordinatePair(0.01, -0.01), false);
}

function testTexasLikeValid() {
  assert.strictEqual(isValidUSTechnicianCoordinates(30.3113, -95.456), true);
  const home = technicianHomeLatLng({
    latitude: 30.3113,
    longitude: -95.456,
    country: 'United States',
  });
  assert.ok(home);
  assert.ok(Math.abs(home.lat - 30.3113) < 0.0001);
  assert.ok(Math.abs(home.lng - -95.456) < 0.0001);
}

function testAlaskaHawaiiPuertoRico() {
  assert.strictEqual(isValidUSTechnicianCoordinates(61.2181, -149.9003), true);
  assert.strictEqual(isValidUSTechnicianCoordinates(21.3069, -157.8583), true);
  assert.strictEqual(isValidUSTechnicianCoordinates(18.2208, -66.5901), true);
}

function testAfricaRejectedForUS() {
  assert.strictEqual(isValidUSTechnicianCoordinates(0, 0), false);
  assert.strictEqual(technicianHomeLatLng({ latitude: 0, longitude: 0, country: 'United States' }), null);
  assert.strictEqual(technicianHomeLatLng({ latitude: null, longitude: null, country: 'United States' }), null);
}

function run() {
  testNullAndEmptyDoNotBecomeZero();
  testNumericStrings();
  testZeroZeroInvalid();
  testTexasLikeValid();
  testAlaskaHawaiiPuertoRico();
  testAfricaRejectedForUS();
  console.log('coordinates tests passed');
}

run();
