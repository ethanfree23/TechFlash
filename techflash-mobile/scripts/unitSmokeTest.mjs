/**
 * Lightweight unit smoke tests for App Review walkthrough readiness helpers.
 * Run: node scripts/unitSmokeTest.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// --- passwordRules (inline mirror of TS logic for node without transpile) ---
const PASSWORD_MIN_LENGTH = 6;
function validatePassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}
function validatePasswordConfirmation(password, confirmation) {
  const base = validatePassword(password);
  if (base) return base;
  if (password !== confirmation) return 'Password confirmation does not match.';
  return null;
}

assert.equal(validatePassword('12345'), 'Password must be at least 6 characters.');
assert.equal(validatePassword('123456'), null);
assert.equal(validatePasswordConfirmation('abcdef', 'abcdef'), null);
assert.equal(validatePasswordConfirmation('abcdef', 'abcdeg'), 'Password confirmation does not match.');

// --- Config / registration contract checks ---
const appJson = JSON.parse(read('app.json'));
assert.equal(appJson.expo.ios.supportsTablet, false, 'iPhone-only: supportsTablet must be false');
assert.equal(appJson.expo.ios.bundleIdentifier, 'com.techflash.app');
assert.ok(
  appJson.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription,
  'NSLocationWhenInUseUsageDescription required'
);
assert.ok(
  (appJson.expo.plugins || []).some((p) => p === 'expo-location' || (Array.isArray(p) && p[0] === 'expo-location')),
  'expo-location plugin required'
);

const registerSrc = read('src/screens/RegisterScreen.tsx');
assert.match(registerSrc, /trade_type/);
assert.match(registerSrc, /skill_class/);
assert.match(registerSrc, /company_name/);
assert.match(registerSrc, /industry/);
assert.match(registerSrc, /keyboardVerticalOffset/);

const authApi = read('src/api/authApi.ts');
assert.match(authApi, /trade_type\?:/);
assert.match(authApi, /skill_class\?:/);

const dash = read('src/screens/DashboardScreen.tsx');
assert.match(dash, /import \{ geocodeAddress \}/);
assert.match(dash, /getForegroundPermissionsAsync/);

const nav = read('src/navigation/RootNavigator.tsx');
assert.match(nav, /PermissionsOnboardingScreen/);

const perms = read('src/screens/PermissionsOnboardingScreen.tsx');
assert.match(perms, /requestForegroundPermissionsAsync/);
assert.match(perms, /requestExpoPushPermissions/);

const conv = read('src/screens/ConversationScreen.tsx');
assert.match(conv, /Block this user/);
assert.match(conv, /Report this conversation/);
assert.match(conv, /blockedMessaging/);

const createJob = read('src/screens/CreateJobScreen.tsx');
assert.match(createJob, /leave Hourly rate blank/);

const more = read('src/screens/MoreScreen.tsx');
assert.match(more, /https:\/\/www\.techflash\.app\/privacy-policy/);
assert.match(more, /https:\/\/www\.techflash\.app\/terms-of-service/);

const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.dependencies['expo-location']);
assert.ok(pkg.dependencies['expo-notifications']);

console.log('unitSmokeTest: PASS');
