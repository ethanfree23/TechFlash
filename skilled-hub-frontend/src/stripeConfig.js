import { isDemoMode } from './utils/demoMode.js';

const KNOWN_DEPLOY_ENVS = new Set(['production', 'staging', 'preview', 'development']);

/**
 * Resolve Stripe deploy class from explicit build-time env only.
 *
 * Trusted sources (first wins): VITE_APP_ENV | VITE_DEPLOY_ENV | VITE_VERCEL_ENV.
 * VITE_VERCEL_ENV is NOT automatic from Vercel — vite.config.js copies process.env.VERCEL_ENV
 * into VITE_VERCEL_ENV at build time when present. Missing env ⇒ "unknown" (fail closed).
 *
 * Never infer production from API hostname (production API is also on *.up.railway.app).
 *
 * @param {ImportMetaEnv | Record<string, unknown>} [env]
 * @returns {'production'|'staging'|'preview'|'development'|'unknown'}
 */
export function resolveStripeDeployEnv(env = import.meta.env) {
  const explicit = String(env.VITE_APP_ENV || env.VITE_DEPLOY_ENV || env.VITE_VERCEL_ENV || '')
    .trim()
    .toLowerCase();
  const api = String(env.VITE_API_BASE_URL || env.VITE_STAGING_API_BASE_URL || '');
  const stripeMode = String(env.VITE_STRIPE_MODE || '').trim().toLowerCase();

  if (explicit === 'production') {
    if (/staging/i.test(api)) {
      console.error('[stripe] contradictory deploy env: production with staging API URL — fail closed');
      return 'unknown';
    }
    if (stripeMode === 'test') {
      console.error('[stripe] contradictory deploy env: production with VITE_STRIPE_MODE=test — fail closed');
      return 'unknown';
    }
    return 'production';
  }

  if (KNOWN_DEPLOY_ENVS.has(explicit)) return explicit;
  if (env.DEV) return 'development';
  if (stripeMode === 'test') return 'staging';
  // API hostname may identify staging, but never production.
  if (/staging/i.test(api)) return 'staging';

  return 'unknown';
}

/** True only for an explicitly configured production Stripe deploy. */
export function allowsLiveStripePublishableKey(env = import.meta.env) {
  if (isDemoMode()) return false;
  return resolveStripeDeployEnv(env) === 'production';
}

/**
 * Historical name: true when pk_live_ must be refused (non-production / unknown / demo / DEV).
 * Fail closed: missing deploy env ⇒ true (live keys blocked).
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

/** Publishable key for Stripe.js — fail closed on missing/contradictory deploy env. */
export function getStripePublishableKey(env = import.meta.env) {
  if (isDemoMode()) {
    const key =
      env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
      env.VITE_STRIPE_PUBLISHABLE_KEY ||
      '';
    return requireTestPublishableKey(key);
  }

  if (allowsLiveStripePublishableKey(env)) {
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
