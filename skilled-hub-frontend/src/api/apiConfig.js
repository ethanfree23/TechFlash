import { Capacitor } from '@capacitor/core';
import { isDemoPath } from '../utils/demoMode';

const PRODUCTION_API = 'https://skilledhub-production.up.railway.app/api/v1';
const LOCAL_API = 'http://localhost:3000/api/v1';

export function isProductionHost() {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  const host = window.location.hostname;
  return host === 'techflash.app' || host === 'www.techflash.app';
}

/** Demo Railway URL from env, or localhost when developing locally. */
export function resolveDemoApiBaseUrl() {
  const fromEnv = import.meta.env?.VITE_DEMO_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return LOCAL_API;
    }
  }
  return null;
}

/** Resolve API base URL at request time (supports /demo path on same deploy). */
export function resolveApiBaseUrl() {
  if (isDemoPath()) {
    const demo = resolveDemoApiBaseUrl();
    if (!demo) {
      throw new Error(
        'Demo API is not configured. Add VITE_DEMO_API_BASE_URL on Vercel to your demo Railway service URL (see DEMO_SETUP.md). For local dev, run the API with RAILS_ENV=demo on port 3000.'
      );
    }
    return demo;
  }

  const override = import.meta.env?.VITE_API_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, '');

  if (isProductionHost()) return PRODUCTION_API;
  return LOCAL_API;
}

export function formatApiFetchError(error) {
  if (error instanceof Error && error.message.includes('Demo API is not configured')) {
    return error;
  }

  const isNetwork =
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));

  if (isNetwork && isDemoPath()) {
    const demo = resolveDemoApiBaseUrl();
    if (!demo) {
      return new Error(
        'Demo API is not configured. Set VITE_DEMO_API_BASE_URL on Vercel to your demo Railway API (see DEMO_SETUP.md).'
      );
    }
    return new Error(
      `Cannot reach the demo API at ${demo}. Deploy the demo Railway service (RAILS_ENV=demo), run demo:reset, and set CORS to allow https://techflash.app.`
    );
  }

  if (isNetwork) {
    return new Error('Cannot reach the server. Check your connection or try again in a moment.');
  }

  return error instanceof Error ? error : new Error(String(error));
}
