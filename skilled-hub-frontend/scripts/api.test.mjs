import assert from 'assert';
import {
  authAPI,
  crmAPI,
  adminUsersAPI,
  jobsAPI,
  conversationsAPI,
  settingsAPI,
} from '../src/api/api.js';

function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function setupEnv() {
  globalThis.localStorage = makeStorage();
  globalThis.localStorage.setItem('token', 'jwt-token');
}

async function withMockedFetch(handler, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

function okJson(data) {
  return { ok: true, text: async () => JSON.stringify(data) };
}

async function testAuthLoginRequestShape() {
  setupEnv();
  let captured = null;
  await withMockedFetch(async (url, config) => {
    captured = { url, config };
    return okJson({ token: 'abc' });
  }, async () => {
    await authAPI.login('a@b.com', 'secret');
  });

  assert.ok(captured.url.endsWith('/api/v1/sessions'));
  assert.strictEqual(captured.config.method, 'POST');
  assert.strictEqual(captured.config.headers.Authorization, 'Bearer jwt-token');
  assert.deepStrictEqual(JSON.parse(captured.config.body), { email: 'a@b.com', password: 'secret' });
}

async function testCrmSearchEncodesQuery() {
  setupEnv();
  let url = '';
  await withMockedFetch(async (u) => {
    url = u;
    return okJson({ companies: [] });
  }, async () => {
    await crmAPI.searchCompanies('A&B Co');
  });
  assert.ok(url.includes('q=A%26B%20Co'), 'query should be URL encoded');
}

async function testAdminUsersListQuery() {
  setupEnv();
  let url = '';
  await withMockedFetch(async (u) => {
    url = u;
    return okJson({ users: [] });
  }, async () => {
    await adminUsersAPI.list({ q: 'raul', role: 'company' });
  });
  assert.ok(url.includes('/admin/users?q=raul&role=company'));
}

async function testJobsFilterSerialization() {
  setupEnv();
  let url = '';
  await withMockedFetch(async (u) => {
    url = u;
    return okJson([]);
  }, async () => {
    await jobsAPI.getAll({ city: 'Austin', state: '', skill_class: null, status: 'open' });
  });
  assert.ok(url.includes('city=Austin'));
  assert.ok(url.includes('status=open'));
  assert.ok(!url.includes('state='));
  assert.ok(!url.includes('skill_class='));
}

async function testConversationsNormalization() {
  setupEnv();
  await withMockedFetch(async () => okJson({ conversations: [{ id: 1 }] }), async () => {
    const rows = await conversationsAPI.getAll();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, 1);
  });
}

async function testSettingsFallbackBaseUrl() {
  setupEnv();
  let capturedBody = null;
  await withMockedFetch(async (_u, config) => {
    capturedBody = JSON.parse(config.body);
    return okJson({ url: 'ok' });
  }, async () => {
    await settingsAPI.createConnectAccountLink();
  });
  assert.strictEqual(capturedBody.base_url, 'http://localhost:5173');
}

async function run() {
  await testAuthLoginRequestShape();
  await testCrmSearchEncodesQuery();
  await testAdminUsersListQuery();
  await testJobsFilterSerialization();
  await testConversationsNormalization();
  await testSettingsFallbackBaseUrl();
  // eslint-disable-next-line no-console
  console.log('api tests passed');
}

run();
