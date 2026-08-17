import { auth } from '../auth.js';
import { isDemoMode } from './demoMode.js';

export const DEFAULT_PRODUCTION_PIXEL_ID = '1113736574652302';

const FBEVENTS_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
const INIT_FLAG = '__TF_META_PIXEL_ID';
const LAST_PAGEVIEW_FLAG = '__TF_META_LAST_PAGEVIEW';
const EVENT_ONCE_PREFIX = 'tf_meta_event:';

const ALLOWED_PARAM_KEYS = new Set([
  'user_type',
  'content_name',
  'content_category',
  'status',
  'value',
  'currency',
]);

const BLOCKED_PARAM_KEYS = new Set([
  'email',
  'phone',
  'first_name',
  'last_name',
  'name',
  'address',
  'zip',
  'zip_code',
  'date_of_birth',
  'ssn',
  'license',
  'license_number',
  'electrical_license_number',
]);

export function getMetaPixelId({ env } = {}) {
  const source = env || (typeof import.meta !== 'undefined' ? import.meta.env : undefined);
  const fromEnv = String(source?.VITE_META_PIXEL_ID || '').trim();
  if (fromEnv) return fromEnv;
  if (source?.MODE === 'production') return DEFAULT_PRODUCTION_PIXEL_ID;
  return '';
}

export function sanitizeMetaEventParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined;
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (BLOCKED_PARAM_KEYS.has(key)) continue;
    if (!ALLOWED_PARAM_KEYS.has(key)) continue;
    if (value == null || value === '') continue;
    if (typeof value === 'object') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function isCapacitorBuild() {
  const mode = typeof import.meta !== 'undefined' ? import.meta.env?.MODE : '';
  return mode === 'capacitor';
}

export function isMetaPixelEnabled({ env } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (isCapacitorBuild()) return false;
  if (isDemoMode()) return false;
  if (window[INIT_FLAG]) return true;
  return Boolean(getMetaPixelId({ env }));
}

function shouldSuppressConversionEvents() {
  try {
    if (auth.isMasquerading()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function installFbq() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.fbq === 'function') return;

  const fbq = function fbqStub() {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, arguments);
    } else {
      fbq.queue.push(arguments);
    }
  };
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];

  if (!document.querySelector('script[src*="fbevents.js"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = FBEVENTS_SRC;
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript?.parentNode?.insertBefore) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else if (document.head?.appendChild) {
      document.head.appendChild(script);
    }
  }
}

export function initializeMetaPixel({ env } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (isCapacitorBuild()) return false;
  if (isDemoMode()) return false;
  const pixelId = window[INIT_FLAG] || getMetaPixelId({ env });
  if (!pixelId) return false;
  installFbq();
  if (typeof window.fbq !== 'function') return false;
  if (window[INIT_FLAG] === pixelId) return true;
  window.fbq('init', pixelId);
  window[INIT_FLAG] = pixelId;
  return true;
}

export function trackMetaPageView({ env } = {}) {
  if (!initializeMetaPixel({ env })) return false;
  const key = `${window.location.pathname || ''}${window.location.search || ''}`;
  if (window[LAST_PAGEVIEW_FLAG] === key) return false;
  window[LAST_PAGEVIEW_FLAG] = key;
  window.fbq('track', 'PageView');
  return true;
}

export function trackMetaEvent(eventName, params, { env } = {}) {
  if (!eventName || typeof eventName !== 'string') return false;
  if (!initializeMetaPixel({ env })) return false;
  if (shouldSuppressConversionEvents()) return false;
  const sanitized = sanitizeMetaEventParams(params);
  if (sanitized) window.fbq('track', eventName, sanitized);
  else window.fbq('track', eventName);
  return true;
}

export function trackMetaCustomEvent(eventName, params, { env } = {}) {
  if (!eventName || typeof eventName !== 'string') return false;
  if (!initializeMetaPixel({ env })) return false;
  if (shouldSuppressConversionEvents()) return false;
  const sanitized = sanitizeMetaEventParams(params);
  if (sanitized) window.fbq('trackCustom', eventName, sanitized);
  else window.fbq('trackCustom', eventName);
  return true;
}

function eventOnceStorageKey(dedupeKey) {
  return `${EVENT_ONCE_PREFIX}${dedupeKey}`;
}

export function trackMetaEventOnce(eventName, params, dedupeKey, { env } = {}) {
  const key = String(dedupeKey || eventName || '').trim();
  if (!key) return false;
  if (!initializeMetaPixel({ env })) return false;
  if (shouldSuppressConversionEvents()) return false;
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(eventOnceStorageKey(key))) {
      return false;
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(eventOnceStorageKey(key), '1');
    }
  } catch {
    /* private mode / unavailable storage */
  }
  return trackMetaEvent(eventName, params, { env });
}

export function trackCompleteRegistration({ userType } = {}) {
  const params = {};
  if (userType === 'technician' || userType === 'company') {
    params.user_type = userType;
  }
  return trackMetaEvent('CompleteRegistration', params);
}

export function trackTechnicianJobClaimed() {
  return trackMetaEvent('SubmitApplication', { content_name: 'job_claim' });
}

export function trackCompanyJobPosted() {
  return trackMetaCustomEvent('JobPosted');
}

export function trackMembershipSubscribe() {
  return trackMetaEventOnce('Subscribe', undefined, 'membership_success');
}

export function resetMetaPixelForTests() {
  if (typeof window !== 'undefined') {
    delete window[INIT_FLAG];
    delete window[LAST_PAGEVIEW_FLAG];
    delete window.fbq;
    delete window._fbq;
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(EVENT_ONCE_PREFIX)) toRemove.push(key);
      }
      toRemove.forEach((key) => sessionStorage.removeItem(key));
    }
  } catch {
    /* ignore */
  }
}
