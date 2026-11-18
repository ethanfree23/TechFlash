import assert from 'assert';
import { getAppNavItems, ROLE_LABELS } from '../src/utils/appNavItems.js';

function ids(items) {
  return items.map((item) => item.id);
}

function testTechnicianPrimaryAndSecondary() {
  const { primary, secondary, showCrm, canRefer, roleLabel } = getAppNavItems(
    { role: 'technician', email: 'tech@example.com', skills_assessments_available: true },
    'full'
  );

  assert.equal(showCrm, false);
  assert.equal(canRefer, true);
  assert.equal(roleLabel, 'Technician');
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'assessments', 'messages', 'legal']);
  assert.ok(!ids(primary).includes('settings'), 'Settings belongs in the drawer account section');
  assert.ok(!ids(primary).includes('crm'));
  assert.ok(!ids(primary).includes('users'));
  assert.deepEqual(ids(secondary), ['settings', 'user_type', 'referral', 'logout']);
  assert.equal(
    secondary.find((item) => item.id === 'user_type')?.label,
    ROLE_LABELS.technician
  );
}

function testTechnicianWithoutAssessmentTradeHidesAssessments() {
  const { primary } = getAppNavItems(
    { role: 'technician', email: 'roofer@example.com', skills_assessments_available: false },
    'full'
  );
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'messages', 'legal']);
  assert.ok(!ids(primary).includes('assessments'));
}

function testCompanyNav() {
  const { primary, secondary, showCrm, canRefer } = getAppNavItems(
    { role: 'company', email: 'co@example.com' },
    'full'
  );

  assert.equal(showCrm, false);
  assert.equal(canRefer, true);
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'technicians', 'messages', 'legal']);
  assert.ok(!ids(primary).includes('assessments'));
  assert.ok(!ids(secondary).includes('crm'));
  assert.ok(ids(secondary).includes('referral'));
  assert.ok(ids(secondary).includes('settings'));
}

function testAdminNavIncludesCrmAndAdminTools() {
  const { primary, secondary, showCrm, canRefer } = getAppNavItems(
    { role: 'admin', email: 'admin@techflash.app' },
    'full'
  );

  assert.equal(showCrm, true);
  assert.equal(canRefer, false);
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'messages', 'users']);
  assert.ok(!ids(primary).includes('crm'), 'CRM stays in the account section on mobile');
  assert.ok(ids(secondary).includes('crm'));
  assert.ok(ids(secondary).includes('settings'));
  assert.ok(ids(secondary).includes('reviews'));
  assert.ok(ids(secondary).includes('job_payments'));
  assert.ok(ids(secondary).includes('trust_safety'));
  assert.ok(ids(secondary).includes('admin_assessments'));
  assert.ok(!ids(secondary).includes('referral'));
  assert.equal(secondary.find((item) => item.id === 'crm')?.to, '/crm');
  assert.ok(!ids(primary).includes('technicians'));
}

function testMinimalPreset() {
  const { primary, secondary } = getAppNavItems({ role: 'company' }, 'minimal');
  assert.deepEqual(ids(primary), ['dashboard', 'jobs', 'legal']);
  assert.ok(ids(secondary).includes('settings'));
  assert.ok(ids(secondary).includes('referral'));
  assert.ok(!ids(secondary).includes('crm'));
}

function testAdminDoesNotLeakToUnauthorizedRoles() {
  for (const role of ['technician', 'company']) {
    const { primary, secondary } = getAppNavItems({ role }, 'full');
    assert.ok(!ids(primary).includes('users'));
    assert.ok(!ids(secondary).includes('crm'));
    assert.ok(!ids(secondary).includes('reviews'));
    assert.ok(!ids(secondary).includes('job_payments'));
    assert.ok(!ids(secondary).includes('trust_safety'));
    assert.ok(!ids(secondary).includes('admin_assessments'));
  }
}

function testJobsDemoAnchorPreserved() {
  const { primary } = getAppNavItems({ role: 'technician' }, 'full');
  const jobs = primary.find((item) => item.id === 'jobs');
  assert.equal(jobs?.demo, 'jobs-tab');
  assert.equal(jobs?.to, '/jobs');
}

testTechnicianPrimaryAndSecondary();
testTechnicianWithoutAssessmentTradeHidesAssessments();
testCompanyNav();
testAdminNavIncludesCrmAndAdminTools();
testMinimalPreset();
testAdminDoesNotLeakToUnauthorizedRoles();
testJobsDemoAnchorPreserved();

console.log('appNavItems.test.mjs: ok');
