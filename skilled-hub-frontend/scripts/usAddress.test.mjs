import assert from 'assert';
import { parseCityState, stripCountryFromAddress, usZip5 } from '../src/utils/usAddress.js';

function testStripCountry() {
  assert.strictEqual(stripCountryFromAddress('Houston, TX, United States'), 'Houston, TX');
  assert.strictEqual(stripCountryFromAddress('Memphis, TN, USA'), 'Memphis, TN');
  assert.strictEqual(stripCountryFromAddress('Texas, United States'), 'Texas');
}

function testParseCityState() {
  assert.deepStrictEqual(parseCityState('Houston, TX, United States'), { city: 'Houston', state: 'TX' });
  assert.deepStrictEqual(parseCityState('Texas, United States'), { city: '', state: 'TX' });
  assert.deepStrictEqual(parseCityState('Memphis, Tennessee'), { city: 'Memphis', state: 'TN' });
}

function testZip5() {
  assert.strictEqual(usZip5('77002-1234'), '77002');
  assert.strictEqual(usZip5('abc'), '');
}

testStripCountry();
testParseCityState();
testZip5();
console.log('usAddress tests passed');
