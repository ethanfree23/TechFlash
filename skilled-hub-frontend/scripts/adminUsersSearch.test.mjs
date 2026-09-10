import assert from 'assert';
import { applyClientSearch, enrichUserRow } from '../src/utils/adminUsersDisplayAdapter.js';

function row(overrides) {
  return enrichUserRow({
    id: 1,
    email: 'ethan@example.com',
    first_name: 'Ethan',
    last_name: 'Freeman',
    phone: '+1 (832) 555-1212',
    company_name: 'FixIt Search Co',
    label: 'HVAC Technician',
    zip_code: '77002',
    role: 'technician',
    ...overrides,
  });
}

function testPartialAndFullName() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, 'Ethan').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'Freeman').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'Ethan Freeman').length, 1);
}

function testEmail() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, 'ethan').length, 1);
  assert.strictEqual(applyClientSearch(rows, '@example.com').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'ethan@example').length, 1);
}

function testPhoneIgnoresFormatting() {
  const rows = [row({ phone: '+18325551212' })];
  ['832', '832555', '8325551212', '(832) 555-1212', '832-555-1212', '+1 832 555 1212', '+18325551212'].forEach((q) => {
    assert.strictEqual(applyClientSearch(rows, q).length, 1, `expected match for ${q}`);
  });
  assert.strictEqual(applyClientSearch(rows, '713').length, 0);
}

function testCompanyTradeZipAndMiss() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, 'FixIt').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'HVAC').length, 1);
  assert.strictEqual(applyClientSearch(rows, '770').length, 1);
  assert.strictEqual(applyClientSearch(rows, '77002').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'zzqx-no-such').length, 0);
}

function testTrimsWhitespace() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, '  Freeman  ').length, 1);
}

testPartialAndFullName();
testEmail();
testPhoneIgnoresFormatting();
testCompanyTradeZipAndMiss();
testTrimsWhitespace();
console.log('adminUsersSearch tests passed');
