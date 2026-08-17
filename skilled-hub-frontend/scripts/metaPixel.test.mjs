import assert from 'assert';
import {
  DEFAULT_PRODUCTION_PIXEL_ID,
  getMetaPixelId,
  sanitizeMetaEventParams,
  initializeMetaPixel,
  trackMetaPageView,
  trackMetaEvent,
  trackMetaCustomEvent,
  trackMetaEventOnce,
  trackCompleteRegistration,
  trackTechnicianJobClaimed,
  trackCompanyJobPosted,
  trackMembershipSubscribe,
  resetMetaPixelForTests,
} from '../src/utils/metaPixel.js';

function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] || null,
    get length() {
      return store.size;
    },
  };
}

function installDom({ pathname = '/', search = '' } = {}) {
  const scripts = [];
  const head = {
    appendChild: (node) => scripts.push(node),
  };
  globalThis.document = {
    head,
    createElement: (tag) => {
      const node = { tagName: tag, async: false, src: '', parentNode: head };
      return node;
    },
    getElementsByTagName: (tag) => (tag === 'script' ? [{ parentNode: head }] : []),
    querySelector: () => null,
  };
  globalThis.window = {
    location: { pathname, search },
  };
  globalThis.sessionStorage = makeStorage();
  globalThis.localStorage = makeStorage();
  return { scripts };
}

function wrapFbq() {
  const calls = [];
  const original = window.fbq;
  window.fbq = function trackedFbq(...args) {
    calls.push(args);
    return original.apply(this, args);
  };
  window.fbq.calls = calls;
  window.fbq.queue = original.queue;
  window.fbq.loaded = original.loaded;
  window.fbq.version = original.version;
  window.fbq.push = window.fbq;
}

function testGetMetaPixelId() {
  assert.strictEqual(getMetaPixelId({ env: {} }), '');
  assert.strictEqual(getMetaPixelId({ env: { MODE: 'development' } }), '');
  assert.strictEqual(getMetaPixelId({ env: { MODE: 'capacitor' } }), '');
  assert.strictEqual(getMetaPixelId({ env: { MODE: 'demo' } }), '');
  assert.strictEqual(getMetaPixelId({ env: { MODE: 'production' } }), DEFAULT_PRODUCTION_PIXEL_ID);
  assert.strictEqual(
    getMetaPixelId({ env: { MODE: 'production', VITE_META_PIXEL_ID: ' 999 ' } }),
    '999'
  );
}

function testSanitizeRejectsPii() {
  const sanitized = sanitizeMetaEventParams({
    user_type: 'technician',
    email: 'tech@example.com',
    phone: '5551234567',
    first_name: 'Ada',
    last_name: 'Lovelace',
    zip_code: '78701',
    nested: { email: 'x' },
    content_name: 'job_claim',
  });
  assert.deepStrictEqual(sanitized, { user_type: 'technician', content_name: 'job_claim' });
  assert.strictEqual(sanitizeMetaEventParams(null), undefined);
  assert.strictEqual(sanitizeMetaEventParams({ email: 'a@b.c' }), undefined);
}

function testNoWindowDoesNotThrow() {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  delete globalThis.window;
  delete globalThis.document;
  assert.doesNotThrow(() => {
    initializeMetaPixel({ env: { MODE: 'production' } });
    trackMetaPageView({ env: { MODE: 'production' } });
    trackMetaEvent('CompleteRegistration', { user_type: 'technician' }, { env: { MODE: 'production' } });
    trackCompleteRegistration({ userType: 'company' });
  });
  globalThis.window = prevWindow;
  globalThis.document = prevDocument;
}

function testInitOnceAndSinglePageView() {
  resetMetaPixelForTests();
  const { scripts } = installDom({ pathname: '/', search: '' });
  const env = { MODE: 'production', VITE_META_PIXEL_ID: DEFAULT_PRODUCTION_PIXEL_ID };

  assert.strictEqual(initializeMetaPixel({ env }), true);
  wrapFbq();
  assert.strictEqual(initializeMetaPixel({ env }), true);
  const inits = window.fbq.calls.filter((args) => args[0] === 'init');
  assert.strictEqual(inits.length, 0, 'second initializeMetaPixel must not call init again');

  resetMetaPixelForTests();
  installDom({ pathname: '/', search: '' });
  assert.strictEqual(trackMetaPageView({ env }), true);
  wrapFbq();
  assert.strictEqual(trackMetaPageView({ env }), false, 'duplicate PageView on same path must be skipped');
  const pageViews = window.fbq.calls.filter((args) => args[0] === 'track' && args[1] === 'PageView');
  assert.strictEqual(pageViews.length, 0);

  resetMetaPixelForTests();
  installDom({ pathname: '/', search: '' });
  trackMetaPageView({ env });
  wrapFbq();
  window.location.pathname = '/login';
  window.location.search = '?tab=signup';
  assert.strictEqual(trackMetaPageView({ env }), true);
  const routed = window.fbq.calls.filter((args) => args[0] === 'track' && args[1] === 'PageView');
  assert.strictEqual(routed.length, 1);
  assert.ok(scripts.length >= 0);
}

function testInitUsesConfiguredPixelId() {
  resetMetaPixelForTests();
  installDom();
  const env = { MODE: 'production' };
  initializeMetaPixel({ env });
  wrapFbq();
  resetMetaPixelForTests();
  installDom();
  initializeMetaPixel({ env });
  const queuedInit = window.fbq.queue.find((args) => args[0] === 'init');
  assert.ok(queuedInit, 'init should be queued');
  assert.strictEqual(queuedInit[1], DEFAULT_PRODUCTION_PIXEL_ID);
}

function testDisabledWithoutPixelId() {
  resetMetaPixelForTests();
  installDom();
  assert.strictEqual(initializeMetaPixel({ env: { MODE: 'development' } }), false);
  assert.strictEqual(typeof window.fbq, 'undefined');
}

function testRegistrationAndDedupe() {
  resetMetaPixelForTests();
  installDom();
  const env = { MODE: 'production' };
  initializeMetaPixel({ env });
  wrapFbq();

  assert.strictEqual(trackCompleteRegistration({ userType: 'technician' }), true);
  const complete = window.fbq.calls.filter((args) => args[0] === 'track' && args[1] === 'CompleteRegistration');
  assert.strictEqual(complete.length, 1);
  assert.deepStrictEqual(complete[0][2], { user_type: 'technician' });

  window.fbq.calls.length = 0;
  assert.strictEqual(trackMembershipSubscribe(), true);
  assert.strictEqual(trackMembershipSubscribe(), false);
  const subs = window.fbq.calls.filter((args) => args[0] === 'track' && args[1] === 'Subscribe');
  assert.strictEqual(subs.length, 1);

  window.fbq.calls.length = 0;
  assert.strictEqual(trackTechnicianJobClaimed(), true);
  const apps = window.fbq.calls.filter((args) => args[0] === 'track' && args[1] === 'SubmitApplication');
  assert.strictEqual(apps.length, 1);
  assert.deepStrictEqual(apps[0][2], { content_name: 'job_claim' });

  window.fbq.calls.length = 0;
  assert.strictEqual(trackCompanyJobPosted(), true);
  const posted = window.fbq.calls.filter((args) => args[0] === 'trackCustom' && args[1] === 'JobPosted');
  assert.strictEqual(posted.length, 1);

  window.fbq.calls.length = 0;
  trackMetaEvent('CompleteRegistration', { email: 'secret@example.com', user_type: 'company' }, { env });
  const withoutEmail = window.fbq.calls.find((args) => args[1] === 'CompleteRegistration');
  assert.deepStrictEqual(withoutEmail[2], { user_type: 'company' });
  assert.ok(!JSON.stringify(withoutEmail).includes('secret@example.com'));
}

function testEventOnceStorageAndCustom() {
  resetMetaPixelForTests();
  installDom();
  const env = { MODE: 'production' };
  initializeMetaPixel({ env });
  wrapFbq();
  assert.strictEqual(trackMetaEventOnce('Subscribe', undefined, 'membership_success', { env }), true);
  assert.strictEqual(trackMetaEventOnce('Subscribe', undefined, 'membership_success', { env }), false);
  assert.strictEqual(trackMetaCustomEvent('JobPosted', { content_category: 'job' }, { env }), true);
}

function run() {
  testGetMetaPixelId();
  testSanitizeRejectsPii();
  testNoWindowDoesNotThrow();
  testInitOnceAndSinglePageView();
  testInitUsesConfiguredPixelId();
  testDisabledWithoutPixelId();
  testRegistrationAndDedupe();
  testEventOnceStorageAndCustom();
  resetMetaPixelForTests();
  console.log('metaPixel tests passed');
}

run();
