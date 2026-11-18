import assert from 'assert';
import {
  ACTIVATION_STATUSES,
  CALL_OUTCOMES,
  activationStatusLabel,
  applyActivationPipelineFilter,
  blockersSummary,
  callOutcomeLabel,
  newClientKey,
} from '../src/utils/technicianActivation.js';

function testConstants() {
  assert.ok(ACTIVATION_STATUSES.includes('ready'));
  assert.ok(ACTIVATION_STATUSES.includes('disqualified'));
  assert.equal(CALL_OUTCOMES.length, 6);
  assert.equal(activationStatusLabel('onboarding'), 'Onboarding');
  assert.equal(callOutcomeLabel('left_voicemail'), 'vm / texted');
}

function testBlockersSummary() {
  assert.equal(blockersSummary({ onboarding_blockers: [] }), '');
  assert.equal(blockersSummary({ onboarding_blockers: ['License', 'Payout setup'] }), 'License, Payout setup');
  assert.equal(
    blockersSummary({ onboarding_blockers: ['A', 'B', 'C'] }),
    'A, B +1',
  );
}

function testPipelineFilters() {
  const rows = [
    { id: 1, role: 'technician', activation: { status: 'new' } },
    { id: 2, role: 'technician', activation: { status: 'contacting', last_contacted_at: '2026-11-01T00:00:00Z', last_call_outcome: 'no_answer' } },
    { id: 3, role: 'technician', activation: { status: 'ready', onboarding_complete: true, last_contacted_at: '2026-11-10T00:00:00Z' } },
    { id: 4, role: 'technician', activation: { status: 'unresponsive', last_contacted_at: '2026-10-01T00:00:00Z' } },
    { id: 5, role: 'company', activation: null },
    { id: 6, role: 'technician', activation: { status: 'nurture', current_availability: 'has_a_job' } },
  ];

  assert.deepEqual(
    applyActivationPipelineFilter(rows, 'never_contacted').map((r) => r.id),
    [1, 6],
  );
  assert.deepEqual(
    applyActivationPipelineFilter(rows, 'awaiting_response').map((r) => r.id),
    [2],
  );
  assert.deepEqual(
    applyActivationPipelineFilter(rows, 'ready_available').map((r) => r.id),
    [3],
  );
  assert.deepEqual(
    applyActivationPipelineFilter(rows, 'has_a_job').map((r) => r.id),
    [6],
  );
  assert.deepEqual(
    applyActivationPipelineFilter(rows, 'unresponsive').map((r) => r.id),
    [4],
  );
}

function testClientKey() {
  const a = newClientKey('call');
  const b = newClientKey('call');
  assert.ok(a.startsWith('call:'));
  assert.notEqual(a, b);
}

function run() {
  testConstants();
  testBlockersSummary();
  testPipelineFilters();
  testClientKey();
  console.log('technicianActivation.test.mjs: ok');
}

run();
