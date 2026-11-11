import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  allowsLiveStripePublishableKey,
  getStripePublishableKey,
  isStagingFrontend,
  isValidStripePublishableKey,
  resolveStripeDeployEnv,
} from '../src/stripeConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function testProdApiUrlAloneDoesNotEnableLiveKeysFailClosed() {
  const e = env({
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'unknown');
  assert.strictEqual(allowsLiveStripePublishableKey(e), false);
  assert.strictEqual(isStagingFrontend(e), true);
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testExplicitProductionWithProdApiAcceptsLiveKey() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'production');
  assert.strictEqual(allowsLiveStripePublishableKey(e), true);
  assert.strictEqual(getStripePublishableKey(e), LIVE_KEY);
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), true);
}

function testVercelEnvProductionInjectionPathAcceptsLiveKey() {
  // Simulates vite.config copying VERCEL_ENV → VITE_VERCEL_ENV on Vercel production.
  const e = env({
    VITE_VERCEL_ENV: 'production',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'production');
  assert.strictEqual(getStripePublishableKey(e), LIVE_KEY);
}

function testProductionRejectsTestKey() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: TEST_KEY,
  });
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(TEST_KEY, e), false);
}

function testContradictoryProductionWithStagingApiFailsClosed() {
  const e = env({
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'unknown');
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testStagingHostRejectsLiveKey() {
  const e = env({
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'staging');
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testStagingHostAcceptsTestKey() {
  const e = env({
    VITE_APP_ENV: 'staging',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY_TEST: TEST_KEY,
  });
  assert.strictEqual(getStripePublishableKey(e), TEST_KEY);
  assert.strictEqual(isValidStripePublishableKey(TEST_KEY, e), true);
}

function testPreviewEnvRejectsLiveKey() {
  const e = env({
    VITE_VERCEL_ENV: 'preview',
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'preview');
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testDevEnvRejectsLiveKey() {
  const e = env({
    DEV: true,
    MODE: 'development',
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(resolveStripeDeployEnv(e), 'development');
  assert.strictEqual(getStripePublishableKey(e), '');
  assert.strictEqual(isValidStripePublishableKey(LIVE_KEY, e), false);
}

function testBareRailwayAppDoesNotImplyStagingOrProduction() {
  const e = env({
    VITE_API_BASE_URL: PROD_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.ok(!/staging/i.test(e.VITE_API_BASE_URL));
  assert.strictEqual(resolveStripeDeployEnv(e), 'unknown');
  assert.strictEqual(getStripePublishableKey(e), '');
}

function testViteConfigInjectsVercelEnvIntoViteNamespace() {
  const viteConfig = fs.readFileSync(path.join(__dirname, '..', 'vite.config.js'), 'utf8');
  assert.ok(
    viteConfig.includes('process.env.VERCEL_ENV'),
    'vite.config.js must read process.env.VERCEL_ENV',
  );
  assert.ok(
    viteConfig.includes('VITE_VERCEL_ENV'),
    'vite.config.js must assign VITE_VERCEL_ENV for client bundle exposure',
  );
  assert.ok(
    viteConfig.includes('Do NOT invent') || viteConfig.includes('fail closed'),
    'vite.config.js must document fail-closed (no silent production default)',
  );
}

function run() {
  testProdApiUrlAloneDoesNotEnableLiveKeysFailClosed();
  testExplicitProductionWithProdApiAcceptsLiveKey();
  testVercelEnvProductionInjectionPathAcceptsLiveKey();
  testProductionRejectsTestKey();
  testContradictoryProductionWithStagingApiFailsClosed();
  testStagingHostRejectsLiveKey();
  testStagingHostAcceptsTestKey();
  testPreviewEnvRejectsLiveKey();
  testDevEnvRejectsLiveKey();
  testBareRailwayAppDoesNotImplyStagingOrProduction();
  testViteConfigInjectsVercelEnvIntoViteNamespace();
  console.log('stripeConfig.test.mjs: ok');
}

run();
