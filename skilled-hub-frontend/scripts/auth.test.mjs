import assert from 'assert';
import { auth } from '../src/auth.js';

function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function b64url(obj) {
  const raw = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function makeJwt(payload) {
  return `x.${b64url(payload)}.y`;
}

function setupGlobals() {
  globalThis.localStorage = makeStorage();
  globalThis.sessionStorage = makeStorage();
  globalThis.atob = (value) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function testTokenAuth() {
  setupGlobals();
  const valid = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  auth.setToken(valid);
  assert.strictEqual(auth.isAuthenticated(), true, 'valid token should authenticate');

  const expired = makeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
  auth.setToken(expired);
  assert.strictEqual(auth.isAuthenticated(), false, 'expired token should fail auth');
}

function testUserRoleHelpers() {
  setupGlobals();
  auth.setUser({ role: 'admin', email: 'admin@example.com' });
  assert.strictEqual(auth.getUserRole(), 'admin');
  assert.strictEqual(auth.isAdmin(), true);
  assert.strictEqual(auth.isCompany(), false);
}

function testMasqueradeRoundTrip() {
  setupGlobals();
  auth.setToken('admin-token');
  auth.setUser({ role: 'admin', email: 'admin@example.com' });

  const masq = makeJwt({ masquerade: true, exp: Math.floor(Date.now() / 1000) + 3600 });
  auth.enterMasquerade(masq, { role: 'company', email: 'company@example.com' });
  assert.strictEqual(auth.isMasquerading(), true);
  assert.strictEqual(auth.getUserRole(), 'company');

  auth.exitMasquerade();
  assert.strictEqual(auth.getToken(), 'admin-token');
  assert.strictEqual(auth.getUserRole(), 'admin');
}

function run() {
  testTokenAuth();
  testUserRoleHelpers();
  testMasqueradeRoundTrip();
  // eslint-disable-next-line no-console
  console.log('auth tests passed');
}

run();
