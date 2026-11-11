import assert from 'assert';
import {
  PRODUCTION_API_BASE_URL,
  allowsLiveStripePublishableKey,
  collectDeployEnvDeclarations,
  getStripePublishableKey,
  isStagingFrontend,
  isValidStripePublishableKey,
  resolveConfiguredApiBaseUrl,
  resolveStripeDeployEnv,
  validateApiForStripeDeploy,
} from '../src/stripeConfig.js';

const PROD_API = PRODUCTION_API_BASE_URL;
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

function testMissingEnvFailsClosed() {
  const e = env({ VITE_API_BASE_URL: PROD_API, VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY });
  assert.strictEqual(resolveStripeDeployEnv(e), 'unknown');
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(allowsLiveStripePublishableKey(e), false);
}

function testAppEnvProductionPlusVercelPreviewFailsClosed() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_VERCEL_ENV: 'preview',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  const decls = collectDeployEnvDeclarations(e);
  assert.strictEqual(decls.ok, false);
  assert.strictEqual(decls.reason, 'contradictory_deploy_env');
  assert.strictEqual(resolveStripeDeployEnv(e), 'unknown');
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testExplicitProductionWithProdApiAcceptsLiveKey() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_VERCEL_ENV: 'production',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'production');
  assert.strictEqual(validateApiForStripeDeploy(e, 'production').ok, true);
  assert.strictEqual(allowsLiveStripePublishableKey(e), true);
  assert.strictEqual(getStripePublishableKey(e), LIVE_KEY);
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), true);
}

function testProductionPlusStagingApiFails() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'production');
  assert.strictEqual(validateApiForStripeDeploy(e, 'production').ok, false);
  assert.strictEqual(allowsLiveStripePublishableKey(e), false);
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testProductionPlusUnknownApiFails() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: 'https://example.com/api/v1',
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(allowsLiveStripePublishableKey(e), false);
}

function testProductionMissingApiFails() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveConfiguredApiBaseUrl(e).reason, 'missing_api');
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testConflictingApiVarsFailClosed() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: PROD_API,
    VITE_STAGING_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveConfiguredApiBaseUrl(e).ok, false);
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testPreviewRejectsLiveKeyAndProdApi() {
  const e = env({
    VITE_VERCEL_ENV: 'preview',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'preview');
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testStagingAcceptsTestKeyAgainstStagingApi() {
  const e = env({
    VITE_APP_ENV: 'staging',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY_TEST: TEST_KEY,
  });
  assert.strictEqual(getStripePublishableKey(e), TEST_KEY);
  assert.strictEqual(isValidStripePublishableKey(TEST_KEY, e), true);
}

function testStagingRejectsLiveKey() {
  const e = env({
    VITE_APP_ENV: 'staging',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testDevRejectsProductionDeclarationAndLiveKey() {
  const e = env({
    DEV: true,
    MODE: 'development',
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'unknown');
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testDevAllowsLocalhostWithTestKey() {
  const e = env({
    DEV: true,
    MODE: 'development',
    VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
    VITE_STRIPE_PUBLISHABLE_KEY_TEST: TEST_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'development');
  assert.strictEqual(getStripePublishableKey(e), TEST_KEY);
}

function testBareRailwayProdUrlIsNotStagingClassification() {
  const e = env({ VITE_API_BASE_URL: PROD_API });
  assert.ok(!/staging/i.test(PROD_API));
  assert.notStrictEqual(resolveStripeDeployEnv(e), 'staging');
  assert.strictEqual(isStagingFrontend(e), true);
}

function run() {
  testMissingEnvFailsClosed();
  testAppEnvProductionPlusVercelPreviewFailsClosed();
  testExplicitProductionWithProdApiAcceptsLiveKey();
  testProductionPlusStagingApiFails();
  testProductionPlusUnknownApiFails();
  testProductionMissingApiFails();
  testConflictingApiVarsFailClosed();
  testPreviewRejectsLiveKeyAndProdApi();
  testStagingAcceptsTestKeyAgainstStagingApi();
  testStagingRejectsLiveKey();
  testDevRejectsProductionDeclarationAndLiveKey();
  testDevAllowsLocalhostWithTestKey();
  testBareRailwayProdUrlIsNotStagingClassification();
  console.log('stripeConfig.test.mjs: ok');
}

run();
