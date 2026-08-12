import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

function testMasqueradeRedirectsStayDemoAware() {
  const adminUsers = read('src/pages/AdminUsersPage.jsx');
  const adminDetail = read('src/pages/AdminUserDetailPage.jsx');

  assert.ok(
    adminUsers.includes("window.location.assign(withDemoPath('/dashboard'))"),
    'AdminUsersPage masquerade should redirect via withDemoPath(/dashboard)',
  );
  assert.ok(
    adminDetail.includes("window.location.assign(withDemoPath('/dashboard'))"),
    'AdminUserDetailPage masquerade should redirect via withDemoPath(/dashboard)',
  );
  assert.ok(
    !adminUsers.includes("window.location.assign('/dashboard')"),
    'AdminUsersPage should not hardcode /dashboard redirect',
  );
  assert.ok(
    !adminDetail.includes("window.location.assign('/dashboard')"),
    'AdminUserDetailPage should not hardcode /dashboard redirect',
  );
}

function testSettingsNoSilentAutoBypass() {
  const settings = read('src/pages/SettingsPage.jsx');

  assert.ok(
    !settings.includes('autoCheckrDemoBypass'),
    'SettingsPage should not auto-enable demo bypass on options error',
  );
  assert.ok(
    settings.includes('const effectiveCheckrDemoBypass = backgroundCheckDemoBypass || localCheckrDemoBypass;'),
    'SettingsPage effective bypass should only use explicit bypass signals',
  );
}

function testDemoEntryUsesAutoLogin() {
  const demoCard = read('src/components/admin/DemoEnvironmentCard.jsx');
  assert.ok(
    demoCard.includes("/login?demo=admin&auto=1"),
    'Demo environment card should open demo admin auto-login URL',
  );
}

function testDemoUrlBuilderHasDemoGuardrail() {
  const demoMode = read('src/utils/demoMode.js');
  assert.ok(
    demoMode.includes('const hasDemoSegment = pathname === \'/demo\' || pathname.startsWith(\'/demo/\');'),
    'getDemoAppUrl should validate that base URL includes a /demo segment',
  );
}

function run() {
  testMasqueradeRedirectsStayDemoAware();
  testSettingsNoSilentAutoBypass();
  testDemoEntryUsesAutoLogin();
  testDemoUrlBuilderHasDemoGuardrail();
  console.log('demo routing tests passed');
}

run();
