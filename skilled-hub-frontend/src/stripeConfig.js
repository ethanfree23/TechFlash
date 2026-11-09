import { isDemoMode } from './utils/demoMode';

function isStagingFrontend() {
  if (import.meta.env.VITE_APP_ENV === 'staging') return true;
  if (import.meta.env.VITE_STRIPE_MODE === 'test') return true;
  const api = String(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_STAGING_API_BASE_URL || '');
  return /staging/i.test(api) || /railway\.app/i.test(api);
}

function rejectLiveKeyInStaging(key) {
  if (!key) return '';
  if (key.startsWith('pk_live_') && (isStagingFrontend() || isDemoMode() || import.meta.env.DEV)) {
    // Never initialize Stripe.js with a live publishable key on staging/demo/dev.
    console.error('[stripe] pk_live_ is forbidden for staging/demo/dev frontends');
    return '';
  }
  return key;
}

/** Live key for production builds (`vite build` / hosted deploy). */
export function getStripePublishableKey() {
  let key = '';
  if (isDemoMode()) {
    key =
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      '';
  } else if (import.meta.env.DEV || isStagingFrontend()) {
    key =
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST ||
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      '';
  } else {
    key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  }
  return rejectLiveKeyInStaging(key);
}

export function isValidStripePublishableKey(key) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (!key.startsWith('pk_')) return false;
  if (key.startsWith('pk_live_') && (isStagingFrontend() || isDemoMode() || import.meta.env.DEV)) {
    return false;
  }
  return true;
}
