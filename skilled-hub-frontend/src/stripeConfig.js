import { isDemoMode } from './utils/demoMode.js';

const KNOWN_DEPLOY_ENVS = new Set(['production', 'staging', 'preview', 'development']);

/** Exact production API allowlist entry for live Stripe.js. */
export const PRODUCTION_API_BASE_URL = 'https://skilledhub-production.up.railway.app/api/v1';

const DEV_API_ALLOWLIST = new Set([
  'http://localhost:3000/api/v1',
  'http://127.0.0.1:3000/api/v1',
]);

function normalizeEnvToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeApiBaseUrl(raw) {
  const trimmed = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  return trimmed || '';
}

/**
 * Collect nonempty deploy-env declarations. Conflicting values ⇒ fail closed.
 * @returns {{ ok: true, value: string } | { ok: false, reason: string, values: string[] }}
 */
export function collectDeployEnvDeclarations(env = import.meta.env) {
  const entries = [
    ['VITE_APP_ENV', normalizeEnvToken(env.VITE_APP_ENV)],
    ['VITE_DEPLOY_ENV', normalizeEnvToken(env.VITE_DEPLOY_ENV)],
    ['VITE_VERCEL_ENV', normalizeEnvToken(env.VITE_VERCEL_ENV)],
  ].filter(([, v]) => v.length > 0);

  if (entries.length === 0) {
    return { ok: false, reason: 'missing_deploy_env', values: [] };
  }

  const values = entries.map(([, v]) => v);
  const unique = [...new Set(values)];
  if (unique.length > 1) {
    console.error(
      `[stripe] contradictory deploy env declarations (${entries
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}) — fail closed`
    );
    return { ok: false, reason: 'contradictory_deploy_env', values: unique };
  }

  const value = unique[0];
  if (!KNOWN_DEPLOY_ENVS.has(value)) {
    return { ok: false, reason: 'unknown_deploy_env', values: [value] };
  }
  return { ok: true, value };
}

/**
 * Resolve configured API base for Stripe gating.
 * Conflicting VITE_API_BASE_URL vs VITE_STAGING_API_BASE_URL ⇒ fail closed.
 */
export function resolveConfiguredApiBaseUrl(env = import.meta.env) {
  const primary = normalizeApiBaseUrl(env.VITE_API_BASE_URL);
  const stagingVar = normalizeApiBaseUrl(env.VITE_STAGING_API_BASE_URL);

  if (primary && stagingVar && primary !== stagingVar) {
    console.error('[stripe] conflicting VITE_API_BASE_URL and VITE_STAGING_API_BASE_URL — fail closed');
    return { ok: false, reason: 'conflicting_api_vars', url: '' };
  }

  const url = primary || stagingVar;
  if (!url) {
    return { ok: false, reason: 'missing_api', url: '' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error('[stripe] invalid API base URL — fail closed');
    return { ok: false, reason: 'invalid_api_url', url: '' };
  }

  const normalized = normalizeApiBaseUrl(`${parsed.origin}${parsed.pathname}`);
  return { ok: true, reason: 'ok', url: normalized, parsed };
}

export function isProductionApiBaseUrl(url) {
  return normalizeApiBaseUrl(url) === PRODUCTION_API_BASE_URL;
}

/**
 * Validate API routing for a resolved deploy class before Stripe.js init.
 */
export function validateApiForStripeDeploy(env = import.meta.env, deployEnv) {
  const api = resolveConfiguredApiBaseUrl(env);
  if (!api.ok) return api;

  const { url, parsed } = api;

  if (deployEnv === 'production') {
    if (parsed.protocol !== 'https:') {
      console.error('[stripe] production API must use https — fail closed');
      return { ok: false, reason: 'wrong_scheme', url };
    }
    if (!isProductionApiBaseUrl(url)) {
      console.error('[stripe] production deploy must target the production API allowlist — fail closed');
      return { ok: false, reason: 'production_api_mismatch', url };
    }
    return { ok: true, reason: 'ok', url };
  }

  // Preview/staging (and unknown non-dev): never initialize Stripe against production API.
  if (deployEnv === 'preview' || deployEnv === 'staging') {
    if (isProductionApiBaseUrl(url)) {
      console.error('[stripe] preview/staging must not route Stripe init to production API — fail closed');
      return { ok: false, reason: 'preview_or_staging_uses_production_api', url };
    }
    if (parsed.protocol !== 'https:') {
      console.error('[stripe] preview/staging API must use https — fail closed');
      return { ok: false, reason: 'wrong_scheme', url };
    }
    return { ok: true, reason: 'ok', url };
  }

  if (deployEnv === 'development') {
    if (isProductionApiBaseUrl(url)) {
      console.error('[stripe] development must not use production API for Stripe init — fail closed');
      return { ok: false, reason: 'development_uses_production_api', url };
    }
    if (DEV_API_ALLOWLIST.has(url)) {
      return { ok: true, reason: 'ok', url };
    }
    if (parsed.protocol === 'https:' && !isProductionApiBaseUrl(url)) {
      return { ok: true, reason: 'ok', url };
    }
    console.error('[stripe] development API is not on the allowlist — fail closed');
    return { ok: false, reason: 'development_api_not_allowed', url };
  }

  return { ok: false, reason: 'unknown_deploy', url };
}

/**
 * Resolve Stripe deploy class. Fail closed on missing/contradictory declarations.
 * Never infer production from API hostname.
 *
 * @returns {'production'|'staging'|'preview'|'development'|'unknown'}
 */
export function resolveStripeDeployEnv(env = import.meta.env) {
  const stripeMode = normalizeEnvToken(env.VITE_STRIPE_MODE);

  if (isDemoMode()) {
    const decls = collectDeployEnvDeclarations(env);
    if (decls.ok && decls.value === 'production') {
      console.error('[stripe] demo mode cannot declare production — fail closed');
    }
    return 'unknown';
  }

  if (env.DEV) {
    const decls = collectDeployEnvDeclarations(env);
    if (decls.ok && decls.value !== 'development') {
      console.error(
        `[stripe] Vite DEV context cannot declare deploy env=${decls.value} — fail closed`
      );
      return 'unknown';
    }
    return 'development';
  }

  const decls = collectDeployEnvDeclarations(env);
  if (!decls.ok) {
    if (stripeMode === 'test') return 'staging';
    const api = resolveConfiguredApiBaseUrl(env);
    if (api.ok && /staging/i.test(api.url) && !isProductionApiBaseUrl(api.url)) {
      return 'staging';
    }
    return 'unknown';
  }

  if (decls.value === 'production') {
    if (stripeMode === 'test') {
      console.error('[stripe] contradictory: production with VITE_STRIPE_MODE=test — fail closed');
      return 'unknown';
    }
    return 'production';
  }

  return decls.value;
}

/** True only for an explicitly consistent production Stripe deploy with allowlisted API. */
export function allowsLiveStripePublishableKey(env = import.meta.env) {
  if (isDemoMode() || env.DEV) return false;
  const deploy = resolveStripeDeployEnv(env);
  if (deploy !== 'production') return false;
  return validateApiForStripeDeploy(env, deploy).ok;
}

/**
 * Historical name: true when pk_live_ must be refused.
 * Fail closed: missing/contradictory deploy env ⇒ true.
 */
export function isStagingFrontend(env = import.meta.env) {
  return !allowsLiveStripePublishableKey(env);
}

function requireTestPublishableKey(key) {
  if (!key) return '';
  if (key.startsWith('pk_live_')) {
    console.error('[stripe] pk_live_ is forbidden for staging/preview/demo/dev/unknown frontends');
    return '';
  }
  if (!key.startsWith('pk_test_')) {
    console.error('[stripe] non-production builds require a pk_test_ publishable key');
    return '';
  }
  return key;
}

function requireLivePublishableKey(key) {
  if (!key) {
    console.error('[stripe] production build requires VITE_STRIPE_PUBLISHABLE_KEY (pk_live_)');
    return '';
  }
  if (!key.startsWith('pk_live_')) {
    console.error('[stripe] production build requires a pk_live_ publishable key');
    return '';
  }
  return key;
}

/** Publishable key for Stripe.js — fail closed on missing/contradictory deploy/API env. */
export function getStripePublishableKey(env = import.meta.env) {
  if (isDemoMode()) {
    const key =
      env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
      env.VITE_STRIPE_PUBLISHABLE_KEY ||
      '';
    return requireTestPublishableKey(key);
  }

  const deploy = resolveStripeDeployEnv(env);
  const apiOk = validateApiForStripeDeploy(env, deploy);
  if (!apiOk.ok) {
    return '';
  }

  if (deploy === 'production') {
    return requireLivePublishableKey(env.VITE_STRIPE_PUBLISHABLE_KEY || '');
  }

  const key =
    env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
    env.VITE_STRIPE_PUBLISHABLE_KEY ||
    '';
  return requireTestPublishableKey(key);
}

export function isValidStripePublishableKey(key, env = import.meta.env) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (!key.startsWith('pk_')) return false;
  if (allowsLiveStripePublishableKey(env)) {
    return key.startsWith('pk_live_');
  }
  return key.startsWith('pk_test_');
}
