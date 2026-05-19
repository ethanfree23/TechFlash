let apiDemoMode = null;
let demoFlagshipJobId = null;
let demoReviewedJobId = null;

/** @returns {boolean} */
export function isDemoMode() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') return true;
  if (typeof window !== 'undefined' && window.location.hostname === 'demo.techflash.app') {
    return true;
  }
  if (apiDemoMode === true) return true;
  return false;
}

/** Called after login or meta fetch when API reports demo_mode. */
export function setApiDemoMode(value) {
  apiDemoMode = value ? true : null;
}

export function setDemoFlagshipJobId(id) {
  demoFlagshipJobId = id || null;
  try {
    if (id) localStorage.setItem('techflash_demo_flagship_job_id', String(id));
  } catch {
    /* ignore */
  }
}

export function getDemoFlagshipJobId() {
  if (demoFlagshipJobId) return demoFlagshipJobId;
  try {
    const raw = localStorage.getItem('techflash_demo_flagship_job_id');
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function setDemoReviewedJobId(id) {
  demoReviewedJobId = id || null;
  try {
    if (id) localStorage.setItem('techflash_demo_reviewed_job_id', String(id));
  } catch {
    /* ignore */
  }
}

export function getDemoReviewedJobId() {
  if (demoReviewedJobId) return demoReviewedJobId;
  try {
    const raw = localStorage.getItem('techflash_demo_reviewed_job_id');
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function isFlagshipDemoJob(job) {
  return Boolean(job && String(job.notes || '').includes('FLAGSHIP_DEMO_JOB'));
}

export function sanitizeDemoJobNotes(notes) {
  return String(notes || '')
    .replace(/FLAGSHIP_DEMO_JOB/gi, '')
    .replace(/Demo showcase job\.?\s*/gi, '')
    .trim();
}

export function demoSimulatedMessage() {
  return 'Demo sandbox — no real charges, emails, or SMS will be sent.';
}

const DISMISS_KEY = 'techflash_demo_banner_dismissed';

export function isDemoBannerDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissDemoBanner() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function resetDemoBannerDismiss() {
  try {
    sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
