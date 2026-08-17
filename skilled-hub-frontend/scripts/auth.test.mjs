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

const adminUser = { id: 1, role: 'admin', email: 'admin@techflash.app' };
const companyUser = { id: 2, role: 'company', email: 'company@example.com' };
const techUser = { id: 99, role: 'technician', email: 'tech@example.com' };

function adminJwt(extra = {}) {
  return makeJwt({ user_id: adminUser.id, exp: Math.floor(Date.now() / 1000) + 3600, ...extra });
}

function masqJwt(user, extra = {}) {
  return makeJwt({
    user_id: user.id,
    masquerade: true,
    impersonator_id: adminUser.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  });
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
  auth.setToken(adminJwt());
  auth.setUser(adminUser);

  const masq = masqJwt(companyUser);
  assert.strictEqual(auth.enterMasquerade(masq, companyUser), true);
  assert.strictEqual(auth.isMasquerading(), true);
  assert.strictEqual(auth.getUserRole(), 'company');

  auth.exitMasquerade();
  assert.strictEqual(auth.getUserRole(), 'admin');
  assert.strictEqual(auth.getUser().id, adminUser.id);
}

function testNestedMasqueradePreservesOriginalAdmin() {
  setupGlobals();
  auth.setToken(adminJwt());
  auth.setUser(adminUser);

  const first = masqJwt(companyUser);
  const second = masqJwt(techUser);
  assert.strictEqual(auth.enterMasquerade(first, companyUser), true);
  assert.strictEqual(auth.enterMasquerade(second, techUser), true);

  auth.exitMasquerade();
  assert.strictEqual(auth.getUserRole(), 'admin');
  assert.strictEqual(auth.getUser().email, adminUser.email);
}

function testExitMasqueradeWithoutCompleteBackupClearsSession() {
  setupGlobals();
  const masq = masqJwt(techUser);
  auth.setToken(masq);
  auth.setUser(techUser);
  sessionStorage.setItem('tf_masq_prev_token', 'admin-token-only');

  const restored = auth.exitMasquerade();
  assert.strictEqual(restored, false);
  assert.strictEqual(auth.getToken(), null);
  assert.strictEqual(auth.getUser(), null);
}

function testLogoutClearsMasqueradeBackup() {
  setupGlobals();
  auth.setToken(adminJwt());
  auth.setUser(adminUser);
  const masq = masqJwt({ ...techUser, email: 'demo.tech.dallas.212@techflash.app' });
  assert.strictEqual(
    auth.enterMasquerade(masq, { ...techUser, email: 'demo.tech.dallas.212@techflash.app' }),
    true
  );
  assert.strictEqual(auth.isMasquerading(), true);
  assert.strictEqual(auth.hasMasqueradeBackup(), true);

  auth.logout();
  assert.strictEqual(auth.getToken(), null);
  assert.strictEqual(auth.getUser(), null);
  assert.strictEqual(auth.isMasquerading(), false);
  assert.strictEqual(auth.hasMasqueradeBackup(), false);
}

function testLateSetUserCannotOverwriteMasqueradeTarget() {
  setupGlobals();
  auth.setToken(adminJwt());
  auth.setUser(adminUser);
  assert.strictEqual(auth.enterMasquerade(masqJwt(techUser), techUser), true);

  assert.strictEqual(auth.setUser(adminUser), false);
  assert.strictEqual(auth.getUser().email, techUser.email);
  assert.strictEqual(auth.getUserRole(), 'technician');
  assert.strictEqual(auth.isMasquerading(), true);
}

function testEnterMasqueradeRejectsAdminTarget() {
  setupGlobals();
  auth.setToken(adminJwt());
  auth.setUser(adminUser);
  const masq = makeJwt({
    user_id: adminUser.id,
    masquerade: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  assert.strictEqual(auth.enterMasquerade(masq, adminUser), false);
  assert.strictEqual(auth.getUser().email, adminUser.email);
  assert.strictEqual(auth.isMasquerading(), false);
}

function testEnterMasqueradeRejectsUserIdMismatch() {
  setupGlobals();
  auth.setToken(adminJwt());
  auth.setUser(adminUser);
  const masq = masqJwt(techUser);
  assert.strictEqual(auth.enterMasquerade(masq, companyUser), false);
  assert.strictEqual(auth.getUserRole(), 'admin');
}

function testBootReconcileRestoresTechnicianFromSnapshot() {
  setupGlobals();
  auth.setToken(adminJwt());
  auth.setUser(adminUser);
  assert.strictEqual(auth.enterMasquerade(masqJwt(techUser), techUser), true);

  localStorage.setItem('user', JSON.stringify(adminUser));
  const reconciled = auth.getUser();
  assert.strictEqual(reconciled.email, techUser.email);
  assert.strictEqual(reconciled.role, 'technician');
  assert.strictEqual(JSON.parse(localStorage.getItem('user')).email, techUser.email);
}

function testGetUserHidesAdminBlobWithoutSnapshot() {
  setupGlobals();
  const masq = masqJwt(techUser);
  auth.setToken(masq);
  localStorage.setItem('user', JSON.stringify(adminUser));
  assert.strictEqual(auth.getUser(), null);
  assert.strictEqual(auth.isMasquerading(), true);
}

function testCoerceTargetUserId() {
  assert.strictEqual(auth.coerceTargetUserId(12), 12);
  assert.strictEqual(auth.coerceTargetUserId('12'), 12);
  assert.strictEqual(auth.coerceTargetUserId(0), null);
  assert.strictEqual(auth.coerceTargetUserId(-1), null);
  assert.strictEqual(auth.coerceTargetUserId('abc'), null);
  assert.strictEqual(auth.coerceTargetUserId(undefined), null);
}

function run() {
  testTokenAuth();
  testUserRoleHelpers();
  testMasqueradeRoundTrip();
  testNestedMasqueradePreservesOriginalAdmin();
  testExitMasqueradeWithoutCompleteBackupClearsSession();
  testLogoutClearsMasqueradeBackup();
  testLateSetUserCannotOverwriteMasqueradeTarget();
  testEnterMasqueradeRejectsAdminTarget();
  testEnterMasqueradeRejectsUserIdMismatch();
  testBootReconcileRestoresTechnicianFromSnapshot();
  testGetUserHidesAdminBlobWithoutSnapshot();
  testCoerceTargetUserId();
  console.log('auth tests passed');
}

run();
