import assert from 'assert';
import { getFullName } from '../src/utils/adminUsersDisplayAdapter.js';
import { buildWorkspaceSearch } from '../src/utils/trustSafety.js';

function technicianHeading({ first_name, last_name, email, profile = {} }) {
  const fromUser = [first_name, last_name].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  if (fromUser) return fromUser;
  const fromProfile = [profile.first_name, profile.last_name].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  if (fromProfile) return fromProfile;
  if (profile.full_name?.trim()) return profile.full_name.trim();
  return getFullName({ first_name, last_name, email });
}

function checklistKeysWithoutIdentityInsurance(checklist) {
  return checklist.map((row) => row.key).filter((key) => key !== 'identity' && key !== 'insurance');
}

function requiredChecklistComplete(summary, checklist) {
  const required = checklist.filter((row) => !row.optional);
  const satisfied = required.filter((row) => row.status === 'verified' || row.status === 'not_applicable');
  return {
    complete: required.length > 0 && satisfied.length === required.length,
    verified_count: satisfied.length,
    total: required.length,
    matchesSummary: summary.complete === (required.length > 0 && satisfied.length === required.length),
  };
}

function testNameDisplay() {
  assert.strictEqual(
    technicianHeading({ first_name: 'John', last_name: 'Smith', email: 'hknockerz@gmail.com' }),
    'John Smith'
  );
  assert.strictEqual(
    technicianHeading({ first_name: '', last_name: '', email: 'hknockerz@gmail.com', profile: { first_name: 'Ada', last_name: 'Tech' } }),
    'Ada Tech'
  );
  assert.strictEqual(
    technicianHeading({ first_name: '', last_name: '', email: 'hknockerz@gmail.com' }),
    'hknockerz@gmail.com'
  );
}

function testChecklistShape() {
  const checklist = [
    { key: 'background_check', status: 'verified' },
    { key: 'references', status: 'pending' },
    { key: 'trade_license', status: 'not_applicable' },
    { key: 'contact', status: 'verified' },
  ];
  assert.deepStrictEqual(checklistKeysWithoutIdentityInsurance(checklist), [
    'background_check',
    'references',
    'trade_license',
    'contact',
  ]);
  const partial = requiredChecklistComplete({ complete: false }, checklist);
  assert.strictEqual(partial.complete, false);
  assert.strictEqual(partial.verified_count, 3);
  assert.strictEqual(partial.total, 4);

  const done = requiredChecklistComplete(
    { complete: true },
    checklist.map((row) => (row.key === 'references' ? { ...row, status: 'verified' } : row))
  );
  assert.strictEqual(done.complete, true);
  assert.strictEqual(done.matchesSummary, true);
}

function testWorkspaceDeepLinkPreserved() {
  const search = buildWorkspaceSearch({
    tab: 'queue',
    filters: { status: 'all' },
    technician: 42,
    item: 'reference:9',
  });
  assert.ok(search.includes('technician=42'));
  assert.ok(search.includes('item=reference%3A9') || search.includes('item=reference:9'));
}

function run() {
  testNameDisplay();
  testChecklistShape();
  testWorkspaceDeepLinkPreserved();
  console.log('adminVerificationWorkspace.test.mjs: ok');
}

run();
