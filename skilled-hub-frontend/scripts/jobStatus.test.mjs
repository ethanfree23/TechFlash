import assert from 'assert';
import { getJobDisplayStatus, canonicalStatusKey } from '../src/utils/jobStatus.js';

const pastIso = '2020-01-01T00:00:00.000Z';

function testUsesEffectiveStatus() {
  const expired = {
    status: 'open',
    effective_status: 'expired',
    scheduled_end_at: pastIso,
    pending_counter_offer: { id: 1 },
  };
  const display = getJobDisplayStatus(expired);
  assert.equal(display.key, 'expired');
  assert.equal(display.label, 'Expired');
  assert.equal(display.tone, 'gray');
  assert.equal(display.hasCounterPending, true);
}

function testDoesNotRederiveExpiredFromDates() {
  const stalePayload = {
    status: 'open',
    scheduled_end_at: pastIso,
  };
  const display = getJobDisplayStatus(stalePayload);
  assert.equal(canonicalStatusKey(stalePayload), 'open');
  assert.equal(display.key, 'open');
  assert.equal(display.label, 'Open');
}

function testCompletedAndClaimedFromEffectiveStatus() {
  assert.equal(getJobDisplayStatus({ status: 'open', effective_status: 'completed' }).key, 'completed');
  assert.equal(getJobDisplayStatus({ status: 'filled', effective_status: 'claimed' }).label, 'Claimed');
  assert.equal(getJobDisplayStatus({ status: 'filled', effective_status: 'active' }).label, 'Active');
  assert.equal(getJobDisplayStatus({ status: 'open', effective_status: 'open' }).label, 'Open');
}

function testPersistedFallbackWithoutDates() {
  assert.equal(getJobDisplayStatus({ status: 'finished' }).key, 'completed');
  assert.equal(getJobDisplayStatus({ status: 'filled' }).key, 'claimed');
  assert.equal(getJobDisplayStatus({ status: 'pending_funding' }).key, 'pending_funding');
}

testUsesEffectiveStatus();
testDoesNotRederiveExpiredFromDates();
testCompletedAndClaimedFromEffectiveStatus();
testPersistedFallbackWithoutDates();
console.log('jobStatus.test.mjs ok');
