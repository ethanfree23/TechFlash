import assert from 'assert';
import { parseUsAddressPaste } from '../src/utils/parseUsAddressPaste.js';

function testAbbrevStateWithCountry() {
  const p = parseUsAddressPaste('123 Main St, Austin, TX 78701, United States');
  assert.strictEqual(p.street_address, '123 Main St');
  assert.strictEqual(p.city, 'Austin');
  assert.strictEqual(p.state, 'Texas');
  assert.strictEqual(p.zip, '78701');
}

function testCityCommaAbbrev() {
  const p = parseUsAddressPaste('456 Oak Ave, Dallas, TX');
  assert.strictEqual(p.city, 'Dallas');
  assert.strictEqual(p.state, 'Texas');
}

function testMultilineAbbrev() {
  const p = parseUsAddressPaste('789 Pine Rd\nHouston, TX 77002');
  assert.strictEqual(p.street_address, '789 Pine Rd');
  assert.strictEqual(p.city, 'Houston');
  assert.strictEqual(p.state, 'Texas');
  assert.strictEqual(p.zip, '77002');
}

function testFullStateName() {
  const p = parseUsAddressPaste('100 Elm St, Miami, Florida 33101');
  assert.strictEqual(p.state, 'Florida');
}

testAbbrevStateWithCountry();
testCityCommaAbbrev();
testMultilineAbbrev();
testFullStateName();
console.log('parseUsAddressPaste tests passed');
