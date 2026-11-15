import assert from 'assert';
import { getAppNavItems, ROLE_LABELS } from '../src/utils/appNavItems.js';

function ids(items) {
  return items.map((item) => item.id);
}

function assertNoUserType(primary, management, account) {
  for (const list of [primary, management, account]) {
    assert.ok(!ids(list).includes('user_type'), 'User Type must not appear in mobile navigation');
  }
}

function testTechnicianPrimaryAndAccount() {
  const { primary, management, account, secondary, showCrm, canRefer, roleLabel, accountSectionLabel } =
    getAppNavItems({ role: 'technician', email: 'tech@example.com' }, 'full');

  assert.equal(showCrm, false);
  assert.equal(canRefer, true);
  assert.equal(roleLabel, ROLE_LABELS.technician);
  assert.equal(accountSectionLabel, 'Account');
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'messages', 'assessments']);
  assert.deepEqual(ids(management), []);
  assert.ok(!ids(primary).includes('settings'), 'Settings belongs in the drawer account section');
  assert.ok(!ids(primary).includes('legal'), 'Legal belongs in Account');
  assert.ok(!ids(primary).includes('crm'));
  assert.ok(!ids(primary).includes('users'));
  assert.deepEqual(ids(account), ['referral', 'legal', 'settings', 'logout']);
  assert.deepEqual(ids(secondary), ids(account), 'secondary aliases account');
  assert.equal(account[0].id, 'referral', 'Send Referral is first in Account');
  assert.equal(account[account.length - 2].id, 'settings');
  assert.equal(account[account.length - 1].id, 'logout');
  assertNoUserType(primary, management, account);
}

function testCompanyNav() {
  const { primary, management, account, showCrm, canRefer } = getAppNavItems(
    { role: 'company', email: 'co@example.com' },
    'full'
  );

  assert.equal(showCrm, false);
  assert.equal(canRefer, true);
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'technicians', 'messages']);
  assert.ok(!ids(primary).includes('assessments'), 'Assessments is technician-only');
  assert.ok(!ids(primary).includes('legal'));
  assert.deepEqual(ids(management), []);
  assert.deepEqual(ids(account), ['referral', 'legal', 'settings', 'logout']);
  assert.ok(!ids(account).includes('crm'));
  assertNoUserType(primary, management, account);
}

function testAdminNavSections() {
  const { primary, management, account, showCrm, canRefer, accountSectionLabel } = getAppNavItems(
    { role: 'admin', email: 'admin@techflash.app' },
    'full'
  );

  assert.equal(showCrm, true);
  assert.equal(canRefer, false);
  assert.equal(accountSectionLabel, 'Account & Tools');
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'messages', 'users']);
  assert.ok(!ids(primary).includes('crm'), 'CRM stays in Account & Tools on mobile');
  assert.ok(!ids(primary).includes('technicians'));
  assert.deepEqual(ids(management), [
    'job_payments',
    'reviews',
    'trust_safety',
    'admin_assessments',
  ]);
  assert.equal(management[0].label, 'Payments');
  assert.deepEqual(ids(account), ['crm', 'settings', 'logout']);
  assert.equal(account.find((item) => item.id === 'crm')?.to, '/crm');
  assert.ok(!ids(account).includes('referral'));
  assert.ok(!ids(account).includes('job_payments'), 'No duplicate Payments in Account');
  assert.equal(account[account.length - 2].id, 'settings');
  assert.equal(account[account.length - 1].id, 'logout');
  assertNoUserType(primary, management, account);
}

function testMinimalPreset() {
  const { primary, management, account } = getAppNavItems({ role: 'company' }, 'minimal');
  assert.deepEqual(ids(primary), ['dashboard', 'jobs']);
  assert.deepEqual(ids(management), []);
  assert.deepEqual(ids(account), ['referral', 'legal', 'settings', 'logout']);
  assertNoUserType(primary, management, account);
}

function testAdminDoesNotLeakToUnauthorizedRoles() {
  for (const role of ['technician', 'company']) {
    const { primary, management, account } = getAppNavItems({ role }, 'full');
    assert.ok(!ids(primary).includes('users'));
    assert.ok(!ids(account).includes('crm'));
    assert.ok(!ids(management).includes('reviews'));
    assert.ok(!ids(management).includes('job_payments'));
    assert.ok(!ids(management).includes('trust_safety'));
    assert.ok(!ids(management).includes('admin_assessments'));
    assert.ok(!ids(account).includes('reviews'));
    assert.ok(!ids(account).includes('job_payments'));
    assert.ok(!ids(account).includes('trust_safety'));
    assert.ok(!ids(account).includes('admin_assessments'));
  }
}

function testJobsDemoAnchorPreserved() {
  const { primary } = getAppNavItems({ role: 'technician' }, 'full');
  const jobs = primary.find((item) => item.id === 'jobs');
  assert.equal(jobs?.demo, 'jobs-tab');
  assert.equal(jobs?.to, '/jobs');
}

testTechnicianPrimaryAndAccount();
testCompanyNav();
testAdminNavSections();
testMinimalPreset();
testAdminDoesNotLeakToUnauthorizedRoles();
testJobsDemoAnchorPreserved();

console.log('appNavItems.test.mjs: ok');
