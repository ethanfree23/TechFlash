/**
 * Real Vite build-level coverage for Stripe deploy gating + VERCEL_ENV injection.
 * Asserts on key prefixes / booleans only — never prints full publishable keys.
 */
import assert from 'assert';
import { build } from 'vite';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { applyVercelEnvToViteProcessEnv } from '../vite.config.js';
import { PRODUCTION_API_BASE_URL } from '../src/stripeConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const PROBE_ENTRY = path.join(__dirname, 'fixtures', 'stripeConfig.probe.js');

const LIVE_KEY = 'pk_live_build_probe_key_not_for_logging';
const TEST_KEY = 'pk_test_build_probe_key_not_for_logging';
const STAGING_API = 'https://techflash-staging-api-staging.up.railway.app/api/v1';

const STRIPE_ENV_KEYS = [
  'VERCEL_ENV',
  'VITE_VERCEL_ENV',
  'VITE_APP_ENV',
  'VITE_DEPLOY_ENV',
  'VITE_STRIPE_MODE',
  'VITE_API_BASE_URL',
  'VITE_STAGING_API_BASE_URL',
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'VITE_STRIPE_PUBLISHABLE_KEY_TEST',
  'VITE_DEMO_MODE',
];

function snapshotEnv() {
  const snap = {};
  for (const k of STRIPE_ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap) {
  for (const k of STRIPE_ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function clearStripeEnv() {
  for (const k of STRIPE_ENV_KEYS) delete process.env[k];
}

async function buildProbe(envVars) {
  const snap = snapshotEnv();
  clearStripeEnv();
  Object.assign(process.env, envVars);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stripe-probe-'));
  try {
    // Same injection path as production vite.config.js
    applyVercelEnvToViteProcessEnv(process.env);

    await build({
      configFile: false,
      root: frontendRoot,
      logLevel: 'error',
      build: {
        outDir,
        emptyOutDir: true,
        sourcemap: false,
        lib: {
          entry: PROBE_ENTRY,
          formats: ['es'],
          fileName: () => 'probe.js',
        },
        rollupOptions: {
          // Keep probe self-contained for Node import after build.
          external: [],
        },
      },
      // Ensure VITE_* from process.env are available during transform.
      envPrefix: ['VITE_'],
    });

    const probePath = path.join(outDir, 'probe.js');
    assert.ok(fs.existsSync(probePath), 'probe bundle missing');
    const mod = await import(`${pathToFileURL(probePath).href}?t=${Date.now()}`);
    return mod.probe;
  } finally {
    restoreEnv(snap);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

async function testVercelProductionBuildAcceptsLiveKey() {
  const probe = await buildProbe({
    VERCEL_ENV: 'production',
    VITE_API_BASE_URL: PRODUCTION_API_BASE_URL,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(probe.deploy, 'production');
  assert.strictEqual(probe.allowsLive, true);
  assert.strictEqual(probe.apiOk, true);
  assert.strictEqual(probe.keyIsLive, true);
  assert.strictEqual(probe.keyEmpty, false);
  assert.strictEqual(probe.keyPrefix, 'pk_live_');
}

async function testVercelPreviewRejectsLiveKey() {
  const probe = await buildProbe({
    VERCEL_ENV: 'preview',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(probe.deploy, 'preview');
  assert.strictEqual(probe.allowsLive, false);
  assert.strictEqual(probe.keyEmpty, true);
  assert.strictEqual(probe.keyIsLive, false);
}

async function testContradictoryAppEnvAndVercelEnvRejected() {
  const probe = await buildProbe({
    VERCEL_ENV: 'preview',
    VITE_APP_ENV: 'production',
    VITE_API_BASE_URL: PRODUCTION_API_BASE_URL,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(probe.deploy, 'unknown');
  assert.strictEqual(probe.allowsLive, false);
  assert.strictEqual(probe.keyEmpty, true);
}

async function testMissingEnvironmentFailsClosed() {
  const probe = await buildProbe({
    VITE_API_BASE_URL: PRODUCTION_API_BASE_URL,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(probe.deploy, 'unknown');
  assert.strictEqual(probe.keyEmpty, true);
  assert.strictEqual(probe.allowsLive, false);
}

async function testProductionEnvWithStagingApiFails() {
  const probe = await buildProbe({
    VERCEL_ENV: 'production',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(probe.deploy, 'production');
  assert.strictEqual(probe.apiOk, false);
  assert.strictEqual(probe.allowsLive, false);
  assert.strictEqual(probe.keyEmpty, true);
}

async function testProductionEnvWithUnknownApiFails() {
  const probe = await buildProbe({
    VERCEL_ENV: 'production',
    VITE_API_BASE_URL: 'https://example.invalid/api/v1',
    VITE_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
  });
  assert.strictEqual(probe.allowsLive, false);
  assert.strictEqual(probe.keyEmpty, true);
}

async function testVercelEnvConflictWithExplicitViteVercelEnvThrows() {
  const snap = snapshotEnv();
  clearStripeEnv();
  process.env.VERCEL_ENV = 'production';
  process.env.VITE_VERCEL_ENV = 'preview';
  try {
    assert.throws(
      () => applyVercelEnvToViteProcessEnv(process.env),
      /conflicts with VERCEL_ENV/
    );
  } finally {
    restoreEnv(snap);
  }
}

async function testPreviewWithTestKeyAgainstStagingApiOk() {
  const probe = await buildProbe({
    VERCEL_ENV: 'preview',
    VITE_API_BASE_URL: STAGING_API,
    VITE_STRIPE_PUBLISHABLE_KEY_TEST: TEST_KEY,
  });
  assert.strictEqual(probe.deploy, 'preview');
  assert.strictEqual(probe.keyIsTest, true);
  assert.strictEqual(probe.keyPrefix, 'pk_test_');
  assert.strictEqual(probe.keyEmpty, false);
}

async function run() {
  await testVercelEnvConflictWithExplicitViteVercelEnvThrows();
  await testVercelProductionBuildAcceptsLiveKey();
  await testVercelPreviewRejectsLiveKey();
  await testContradictoryAppEnvAndVercelEnvRejected();
  await testMissingEnvironmentFailsClosed();
  await testProductionEnvWithStagingApiFails();
  await testProductionEnvWithUnknownApiFails();
  await testPreviewWithTestKeyAgainstStagingApiOk();
  console.log('stripeConfig.build.test.mjs: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
