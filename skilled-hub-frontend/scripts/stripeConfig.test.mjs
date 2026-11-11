import assert from 'assert';
import {
  getStripePublishableKey,
  isStagingFrontend,
  isValidStripePublishableKey,
} from '../src/stripeConfig.js';

const PROD_API = 'https://skilledhub-production.up.railway.app/api/v1';
const STAGING_API = 'https://techflash-staging-api-staging.up.railway.app/api/v1';
const LIVE_KEY = 'pk_live_test_live_key_for_unit_tests_only';
const TEST_KEY = 'pk_test_test_publishable_key_for_unit_tests';

function env(overrides = {}) {
  return {
    DEV: false,
    PROD: true,
    MODE: 'production',
    VITE_APP_ENV: undefined,
    VITE_DEPLOY_ENV: undefined,
    VITE_VERCEL_ENV: undefined,
    VITE_STRIPE_MODE: undefined,
    VITE_API_BASE_URL: undefined,
    VITE_STAGING_API_BASE_URL: undefined,
    VITE_STRIPE_PUBLISHABLE_KEY: undefined,
    VITE_STRIPE_PUBLISHABLE_KEY_TEST: undefined,
    ...overrides,
  };
}

function testProductionApiHostAcceptsLiveKey() {
  const e = env({
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(isStagingFrontend(e), false, 'production railway host must not be staging');
  assert.strictEqual(getStripePublishableKey(e), LIVE_KEY);
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), true);
}

function testExplicitProductionEnvAcceptsLiveKeyEvenWithRailwayUrl() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(isStagingFrontend(e), false);
  assert.strictEqual(getStripePublishableKey(e), LIVE_KEY);
}

function testStagingHostRejectsLiveKey() {
  const e = env({
    VITE_API_BASE_URL: STAGING_API,
    // Only a live key present — staging must discard it (empty), not initialize Stripe.js.
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(isStagingFrontend(e), true);
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testStagingHostAcceptsTestKey() {
  const e = env({
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY_TEST: TEST_KEY,
  });
  assert.strictEqual(getStripePublishableKey(e), TEST_KEY);
  assert.strictEqual(isValidStripePublishableKey(TEST_KEY, e), true);
}

function testPreviewEnvRejectsLiveKey() {
  const e = env({
    VITE_VERCEL_ENV: 'preview',
    VITE_API_BASE_URL: PROD_API, // even if pointed at prod API, preview must refuse live
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(isStagingFrontend(e), true);
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testDevEnvRejectsLiveKey() {
  const e = env({
    DEV: true,
    MODE: 'development',
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testBareRailwayAppNoLongerImpliesStaging() {
  // Regression for PR #29 bug: /railway\.app/ matched production.
  const e = env({
    VITE_API_BASE_URL: 'https://skilledhub-production.up.railway.app/api/v1',
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.ok(!/staging/i.test(e.VITE_API_BASE_URL));
  assert.strictEqual(isStagingFrontend(e), false);
  assert.strictEqual(getStripePublishableKey(e), LIVE_KEY);
}

function run() {
  testProductionApiHostAcceptsLiveKey();
  testExplicitProductionEnvAcceptsLiveKeyEvenWithRailwayUrl();
  testStagingHostRejectsLiveKey();
  testStagingHostAcceptsTestKey();
  testPreviewEnvRejectsLiveKey();
  testDevEnvRejectsLiveKey();
  testBareRailwayAppNoLongerImpliesStaging();
  console.log('stripeConfig.test.mjs: ok');
}

run();
