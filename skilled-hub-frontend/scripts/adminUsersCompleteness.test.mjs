import assert from 'assert';
import { computeProfileCompleteness } from '../src/utils/adminUsersDisplayAdapter.js';

function testTechnicianCompletenessUsesRealLicenseAndPhoto() {
  const row = {
    role: 'technician',
    first_name: 'Alex',
    last_name: 'Tapia',
    email: 'alex@example.com',
    phone: '7135550111',
    label: 'HVAC Technician',
  };
  const incomplete = computeProfileCompleteness(row, {
    user: {
      profile: {
        trade_type: 'HVAC Technician',
        zip_code: '77002',
      },
    },
  });
  assert.ok(incomplete.missing.includes('License'));
  assert.ok(incomplete.missing.includes('Profile photo'));

  const complete = computeProfileCompleteness(row, {
    user: {
      profile: {
        trade_type: 'HVAC Technician',
        zip_code: '77002',
        avatar_url: '/rails/active_storage/blobs/photo.png',
        trade_licenses: [{ id: 1, document_number: 'TX-1', file_url: '/rails/active_storage/blobs/license.png' }],
        stripe_account_id: 'acct_1',
      },
    },
  });
  assert.ok(!complete.missing.includes('License'));
  assert.ok(!complete.missing.includes('Profile photo'));
  assert.ok(complete.percent > incomplete.percent);
}

function testLocationCountsWhenOnlyZipIsOnTheListRow() {
  const completeness = computeProfileCompleteness(
    {
      role: 'technician',
      first_name: 'Keith',
      last_name: 'Harris',
      email: 'keith@example.com',
      phone: '3464098882',
      label: 'Low-Voltage / Telecom Technician',
      zip_code: '77583',
    },
    { user: { profile: {} } }
  );
  assert.ok(!completeness.missing.includes('Location'));
}

testTechnicianCompletenessUsesRealLicenseAndPhoto();
testLocationCountsWhenOnlyZipIsOnTheListRow();
console.log('adminUsersCompleteness tests passed');
