import assert from 'assert';
import { formatPhoneInput } from '../src/utils/phone.js';

function testEmptyPhone() {
  assert.strictEqual(formatPhoneInput(''), '');
  assert.strictEqual(formatPhoneInput(null), '');
}

function testBasicFormatting() {
  assert.strictEqual(formatPhoneInput('9565551234'), '+1 (956) 555-1234');
  assert.strictEqual(formatPhoneInput('(956) 555-1234'), '+1 (956) 555-1234');
}

function testLeadingOneAndTrim() {
  assert.strictEqual(formatPhoneInput('19565551234'), '+1 (956) 555-1234');
  assert.strictEqual(formatPhoneInput('19565551234999'), '+1 (956) 555-1234');
}

function run() {
  testEmptyPhone();
  testBasicFormatting();
  testLeadingOneAndTrim();
  // eslint-disable-next-line no-console
  console.log('phone tests passed');
}

run();
