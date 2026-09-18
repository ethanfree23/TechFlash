import assert from 'assert';
import {
  authAPI,
  crmAPI,
  adminUsersAPI,
  jobsAPI,
  conversationsAPI,
  settingsAPI,
  assessmentsAPI,
  adminAssessmentsAPI,
  profilesAPI,
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

async function testAdminDemoAccountsRoute() {
  setupEnv();
  let url = '';
  await withMockedFetch(async (u) => {
    url = u;
    return okJson({ accounts: {} });
  }, async () => {
    await adminUsersAPI.demoAccounts();
  });
  assert.ok(url.includes('/admin/masquerade/demo_accounts'));
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

async function testAssessmentsApiRoutes() {
  setupEnv();
  const captured = [];
  await withMockedFetch(async (url, config) => {
    captured.push({ url, method: config.method || 'GET', body: config.body });
    return okJson({ assessments: [], id: 9, attempts: [] });
  }, async () => {
    await assessmentsAPI.catalog();
    await assessmentsAPI.start('hvac_knowledge');
    await assessmentsAPI.saveAnswers(9, [{ question_id: 1, answer_choice_id: 2 }]);
    await assessmentsAPI.submit(9);
    await assessmentsAPI.getAttempt(9, { includeReview: true });
    await adminAssessmentsAPI.publishVersion(4);
    await adminAssessmentsAPI.import({ assessment: { slug: 'x' } }, { dryRun: true });
    await profilesAPI.getTechnicianAssessmentResults(12);
  });

  assert.ok(captured[0].url.endsWith('/assessments'));
  assert.strictEqual(captured[1].method, 'POST');
  assert.ok(captured[1].url.endsWith('/assessments/hvac_knowledge/attempts'));
  assert.strictEqual(captured[2].method, 'PATCH');
  assert.ok(captured[3].url.endsWith('/assessment_attempts/9/submit'));
  assert.ok(captured[4].url.endsWith('/assessment_attempts/9?include=review'));
  assert.ok(captured[5].url.endsWith('/admin/assessment_versions/4/publish'));
  assert.strictEqual(JSON.parse(captured[6].body).dry_run, true);
  assert.ok(captured[7].url.endsWith('/technicians/12/assessment_results'));
}

async function run() {
  await testAuthLoginRequestShape();
  await testCrmSearchEncodesQuery();
  await testAdminUsersListQuery();
  await testAdminDemoAccountsRoute();
  await testJobsFilterSerialization();
  await testConversationsNormalization();
  await testSettingsFallbackBaseUrl();
  await testAssessmentsApiRoutes();
  console.log('api tests passed');
}

run();
