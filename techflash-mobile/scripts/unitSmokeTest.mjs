/**
 * Lightweight unit smoke tests for App Review walkthrough readiness helpers.
 * Run: node scripts/unitSmokeTest.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');

function read(rel, base = root) {
  return fs.readFileSync(path.join(base, rel), 'utf8');
}

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

const appJson = JSON.parse(read('app.json'));
assert.equal(appJson.expo.ios.supportsTablet, false, 'iPhone-only: supportsTablet must be false');
assert.equal(appJson.expo.ios.bundleIdentifier, 'com.techflash.app');
assert.equal(appJson.expo.name, 'TechFlash');
assert.ok(appJson.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription);
assert.ok(
  (appJson.expo.plugins || []).some((p) => p === 'expo-location' || (Array.isArray(p) && p[0] === 'expo-location'))
);

const eas = JSON.parse(read('eas.json'));
assert.equal(
  eas.build.production.env.EXPO_PUBLIC_API_BASE_URL,
  'https://skilledhub-production.up.railway.app/api/v1'
);
assert.equal(eas.build.production.autoIncrement, true);

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
assert.match(perms, /Ask Next Time/);

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

// Credentials must not be committed as plaintext passwords in review docs/tasks.
const credentialDocs = [
  'APP_STORE_REVIEW_NOTES.md',
  'techflash-mobile/docs/app-review-recording-readiness.md',
  'techflash-mobile/docs/app-store-review-package.md',
  'skilled_hub_api/lib/tasks/app_review.rake',
];
for (const rel of credentialDocs) {
  const body = read(rel, repoRoot);
  assert.match(body, /App Store Connect/, `${rel} should point passwords to App Store Connect`);
  assert.doesNotMatch(
    body,
    /Password\s*\(both\):\s*`[^`]+`/i,
    `${rel} must not embed reviewer passwords`
  );
  assert.doesNotMatch(
    body,
    /Password:\s*`[^`]+`/i,
    `${rel} must not embed reviewer passwords in backticks`
  );
  assert.doesNotMatch(body, /APP_REVIEW_PASSWORD\s*=/, `${rel} must not default a password env literal`);
}
const prepareSrc = read('skilled_hub_api/app/services/app_review/prepare_service.rb', repoRoot);
assert.doesNotMatch(prepareSrc, /password\s*[:=]/i, 'prepare_service must not handle passwords');
assert.match(prepareSrc, /verify_claimable!/);
assert.match(prepareSrc, /posted_under_funding_waiver: true/);

assert.match(prepareSrc, /membership_fee_waived: true/);
assert.match(prepareSrc, /clear_mutual_blocks!/);

console.log('unitSmokeTest: PASS');
