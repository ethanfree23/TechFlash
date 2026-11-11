import { isDemoMode } from './utils/demoMode.js';

/**
 * True for staging/preview/dev Stripe safety mode (refuse pk_live_).
 *
 * Must NOT treat the production Railway API host as staging. Production API is
 * https://skilledhub-production.up.railway.app/api/v1 — a bare /railway\.app/
 * match incorrectly discarded pk_live_ on www.techflash.app after PR #29.
 *
 * Prefer explicit build-time env: VITE_APP_ENV | VITE_DEPLOY_ENV | VITE_VERCEL_ENV
 * (= production | staging | preview | development). Fall back to matching
 * "staging" in the API base URL only.
 *
 * @param {ImportMetaEnv | Record<string, unknown>} [env]
 */
export function isStagingFrontend(env = import.meta.env) {
  const deployEnv = String(
    env.VITE_APP_ENV || env.VITE_DEPLOY_ENV || env.VITE_VERCEL_ENV || ''
  )
    .trim()
    .toLowerCase();

  if (deployEnv === 'production') return false;
  if (deployEnv === 'staging' || deployEnv === 'preview' || deployEnv === 'development') {
    return true;
  }

  if (String(env.VITE_STRIPE_MODE || '').trim().toLowerCase() === 'test') {
    return true;
  }

  const api = String(env.VITE_API_BASE_URL || env.VITE_STAGING_API_BASE_URL || '');
  // Explicit staging API hosts only (e.g. techflash-staging-api-staging.up.railway.app).
  // Never match bare railway.app — production also lives on *.up.railway.app.
  return /staging/i.test(api);
}

function rejectLiveKeyInNonProd(key, env = import.meta.env) {
  if (!key) return '';
  if (
    key.startsWith('pk_live_') &&
    (isStagingFrontend(env) || isDemoMode() || Boolean(env.DEV))
  ) {
    // Never initialize Stripe.js with a live publishable key on staging/preview/demo/dev.
    console.error('[stripe] pk_live_ is forbidden for staging/preview/demo/dev frontends');
    return '';
  }
  return key;
}

/** Live key for production builds (`vite build` / hosted deploy). */
export function getStripePublishableKey(env = import.meta.env) {
  let key = '';
  if (isDemoMode()) {
    key =
      env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
      env.VITE_STRIPE_PUBLISHABLE_KEY ||
      '';
  } else if (env.DEV || isStagingFrontend(env)) {
    key =
      env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
      env.VITE_STRIPE_PUBLISHABLE_KEY ||
      '';
  } else {
    key = env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  }
  return rejectLiveKeyInNonProd(key, env);
}

export function isValidStripePublishableKey(key, env = import.meta.env) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (!key.startsWith('pk_')) return false;
  if (
    key.startsWith('pk_live_') &&
    (isStagingFrontend(env) || isDemoMode() || Boolean(env.DEV))
  ) {
    return false;
  }
  return true;
}
