import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDemoRoleAutoLoginSearch, isDemoRoleAutoLoginLocation } from '../src/utils/demoMode.js';

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

function testDemoAutoLoginClearsStaleSession() {
  const app = read('src/App.jsx');
  const login = read('src/pages/LoginPage.jsx');
  const dashboard = read('src/pages/Dashboard.jsx');

  assert.ok(
    app.includes('isDemoRoleAutoLoginLocation()'),
    'App boot should logout before demo auto-login so a stale masquerade cannot skip admin sign-in',
  );
  assert.ok(
    app.includes('isDemoRoleAutoLoginSearch(searchParams)'),
    'PublicRoute should allow /login?demo=admin&auto=1 even if a session already exists',
  );
  assert.ok(
    login.includes('auth.logout()'),
    'Demo/admin login should clear the previous session and masquerade backup',
  );
  assert.ok(
    login.includes('handleDemoLogin(role)'),
    'Login page should expose explicit demo role sign-in buttons',
  );
  assert.ok(
    login.includes('Login as ${DEMO_ACCOUNTS[role].label}'),
    'Login page should label demo buttons as Login as Demo Admin/Company/Technician',
  );
  assert.ok(
    dashboard.includes('DEFAULT_VIEW_DIAMETER_MI = 45'),
    'Technician map should use a 45-mile diameter (width), not a 45-mile radius',
  );
  assert.ok(
    dashboard.includes('zoomForMapWidthMiles'),
    'Technician home camera should set zoom from map width, not fitBounds of a radius circle',
  );
}

function testDemoAutoLoginHelpers() {
  assert.strictEqual(isDemoRoleAutoLoginSearch(new URLSearchParams('demo=admin&auto=1')), true);
  assert.strictEqual(isDemoRoleAutoLoginSearch(new URLSearchParams('demo=admin')), false);
  assert.strictEqual(isDemoRoleAutoLoginSearch(new URLSearchParams('demo=technician&auto=1')), true);
  assert.strictEqual(isDemoRoleAutoLoginSearch(new URLSearchParams('demo=nope&auto=1')), false);
  assert.strictEqual(
    isDemoRoleAutoLoginLocation({ pathname: '/demo/login', search: '?demo=admin&auto=1' }),
    true,
  );
  assert.strictEqual(
    isDemoRoleAutoLoginLocation({ pathname: '/demo/dashboard', search: '?demo=admin&auto=1' }),
    false,
  );
}

function run() {
  testMasqueradeRedirectsStayDemoAware();
  testSettingsNoSilentAutoBypass();
  testDemoEntryUsesAutoLogin();
  testDemoUrlBuilderHasDemoGuardrail();
  testDemoAutoLoginClearsStaleSession();
  testDemoAutoLoginHelpers();
  console.log('demo routing tests passed');
}

run();
