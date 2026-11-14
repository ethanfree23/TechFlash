import assert from 'assert';
import {
  parseItemKey,
  buildItemKey,
  parseWorkspaceSearch,
  buildWorkspaceSearch,
  applyMetricFilter,
  validateDecision,
  nextPendingKey,
  stepKey,
  isBulkSelectable,
  buildDecisionPayload,
  describeApiError,
  priorityPresentation,
  formatRelative,
  daysUntil,
  reviewTypeForTab,
  DEFAULT_QUEUE_FILTERS,
} from '../src/utils/trustSafety.js';

function testItemKeys() {
  assert.deepStrictEqual(parseItemKey('document:12'), { itemType: 'document', id: 12 });
  assert.deepStrictEqual(parseItemKey('background_check:3'), { itemType: 'background_check', id: 3 });
  assert.strictEqual(parseItemKey('widget:3'), null);
  assert.strictEqual(parseItemKey('document:abc'), null);
  assert.strictEqual(parseItemKey(''), null);
  assert.strictEqual(buildItemKey('reference', 9), 'reference:9');
}

function testUrlRoundTrip() {
  const parsed = parseWorkspaceSearch('?tab=credentials&q=lopez&page=2&item=document:12&technician=4&status=approved');
  assert.strictEqual(parsed.tab, 'credentials');
  assert.strictEqual(parsed.filters.q, 'lopez');
  assert.strictEqual(parsed.filters.page, 2);
  assert.strictEqual(parsed.filters.status, 'approved');
  // credentials tab forces the review type regardless of the URL
  assert.strictEqual(parsed.filters.review_type, 'credential');
  assert.strictEqual(parsed.item, 'document:12');
  assert.strictEqual(parsed.technician, 4);

  const rebuilt = buildWorkspaceSearch(parsed);
  const reparsed = parseWorkspaceSearch(rebuilt);
  assert.deepStrictEqual(reparsed, parsed);

  // defaults produce an empty search string
  assert.strictEqual(buildWorkspaceSearch({ tab: 'queue', filters: { ...DEFAULT_QUEUE_FILTERS } }), '');
  // queue tab defaults to needs_review, other tabs default to all
  assert.strictEqual(parseWorkspaceSearch('').filters.status, 'needs_review');
  assert.strictEqual(parseWorkspaceSearch('?tab=references').filters.status, 'all');
  assert.strictEqual(parseWorkspaceSearch('?tab=references').filters.review_type, 'reference');
  // invalid item keys are dropped
  assert.strictEqual(parseWorkspaceSearch('?item=nope').item, null);
  assert.strictEqual(reviewTypeForTab('queue', 'reference'), 'reference');
  assert.strictEqual(reviewTypeForTab('background_checks', 'reference'), 'background_check');
}

function testMetricFilter() {
  const current = { tab: 'activity', filters: { ...DEFAULT_QUEUE_FILTERS, q: 'x' }, item: 'document:1', verification: 'all' };
  const next = applyMetricFilter(current, { tab: 'queue', status: 'pending', review_type: 'background_check' });
  assert.strictEqual(next.tab, 'queue');
  assert.strictEqual(next.filters.status, 'pending');
  assert.strictEqual(next.filters.review_type, 'background_check');
  assert.strictEqual(next.filters.q, '');
  assert.strictEqual(next.item, null);
  const techs = applyMetricFilter(current, { tab: 'technicians', verification: 'verified' });
  assert.strictEqual(techs.tab, 'technicians');
  assert.strictEqual(techs.verification, 'verified');
}

function testDecisionValidation() {
  const approve = { key: 'approve', requires_reason: false, requires_confirmation: true };
  assert.strictEqual(validateDecision(approve, { confirmed: false }).valid, false);
  assert.strictEqual(validateDecision(approve, { confirmed: true }).valid, true);
  const reject = { key: 'reject', requires_reason: true, requires_confirmation: true };
  assert.strictEqual(validateDecision(reject, { reason: '', confirmed: true }).valid, false);
  assert.strictEqual(validateDecision(reject, { reason: 'Expired license', confirmed: true }).valid, true);
  const note = { key: 'note', requires_reason: true, requires_confirmation: false };
  assert.deepStrictEqual(validateDecision(note, { reason: '' }).errors, ['Enter a note.']);
  assert.strictEqual(validateDecision(null).valid, false);
}

function testNavigation() {
  const items = [
    { key: 'document:1', needs_review: true },
    { key: 'background_check:2', needs_review: false },
    { key: 'reference:3', needs_review: true },
    { key: 'document:4', needs_review: true },
  ];
  assert.strictEqual(nextPendingKey(items, 'document:1'), 'reference:3');
  assert.strictEqual(nextPendingKey(items, 'document:4'), 'document:1');
  assert.strictEqual(nextPendingKey(items, null), 'document:1');
  assert.strictEqual(nextPendingKey([{ key: 'document:1', needs_review: true }], 'document:1'), null);
  assert.strictEqual(stepKey(items, 'document:1', 1), 'background_check:2');
  assert.strictEqual(stepKey(items, 'document:1', -1), 'document:4');
  assert.strictEqual(stepKey(items, null, 1), 'document:1');
  assert.strictEqual(stepKey([], null, 1), null);
}

function testBulkSafety() {
  assert.strictEqual(isBulkSelectable({ item_type: 'background_check', needs_review: true }), false);
  assert.strictEqual(isBulkSelectable({ item_type: 'document', needs_review: true }), true);
  assert.strictEqual(isBulkSelectable({ item_type: 'document', needs_review: false }), false);
  assert.strictEqual(isBulkSelectable({ item_type: 'reference', needs_review: true }), true);
}

function testPayloads() {
  const check = { item_type: 'background_check', updated_at: '2026-01-01T00:00:00Z' };
  const bg = buildDecisionPayload(check, { key: 'manually_approved' }, { reason: ' ok ', confirmed: true });
  assert.strictEqual(bg.endpoint, 'overrideBackgroundCheck');
  assert.deepStrictEqual(bg.body, { expected_updated_at: '2026-01-01T00:00:00Z', override_status: 'manually_approved', reason: 'ok', confirm: true });

  const doc = { item_type: 'document', updated_at: 'x' };
  const reject = buildDecisionPayload(doc, { key: 'reject', override: true }, { reason: 'Blurry', confirmed: true });
  assert.strictEqual(reject.endpoint, 'reviewDocument');
  assert.strictEqual(reject.body.status, 'rejected');
  assert.strictEqual(reject.body.override, true);
  const info = buildDecisionPayload(doc, { key: 'request_info' }, { reason: 'Need back side' });
  assert.deepStrictEqual(info, { endpoint: 'requestDocumentInfo', body: { reason: 'Need back side' } });

  const ref = { item_type: 'reference', updated_at: 'y' };
  const approve = buildDecisionPayload(ref, { key: 'approve' }, { reason: '', confirmed: true });
  assert.strictEqual(approve.endpoint, 'reviewReference');
  assert.strictEqual(approve.body.status, 'approved');
  assert.strictEqual(buildDecisionPayload({ item_type: 'other' }, { key: 'approve' }, {}), null);
}

function testErrors() {
  assert.match(describeApiError({ status: 409, details: { code: 'stale_write' } }), /Another reviewer/);
  assert.match(describeApiError({ status: 409, details: { code: 'already_reviewed' } }), /already decided/);
  assert.strictEqual(describeApiError({ message: 'Boom' }), 'Boom');
  assert.strictEqual(describeApiError({ details: { code: 'override_not_allowed' }, message: 'No report yet' }), 'No report yet');
}

function testFormatting() {
  assert.deepStrictEqual(priorityPresentation({ level: 'high' }), { label: 'High', variant: 'danger' });
  assert.deepStrictEqual(priorityPresentation(null), { label: 'Normal', variant: 'neutral' });
  const now = Date.parse('2026-11-14T12:00:00Z');
  assert.strictEqual(formatRelative('2026-11-14T11:30:00Z', now), '30m ago');
  assert.strictEqual(formatRelative('2026-11-13T11:30:00Z', now), '24h ago');
  assert.strictEqual(formatRelative('2026-11-04T11:30:00Z', now), '10d ago');
  assert.strictEqual(formatRelative(null, now), '—');
  assert.strictEqual(daysUntil('2026-11-24T12:00:00Z', now), 10);
  assert.strictEqual(daysUntil(null), null);
}

testItemKeys();
testUrlRoundTrip();
testMetricFilter();
testDecisionValidation();
testNavigation();
testBulkSafety();
testPayloads();
testErrors();
testFormatting();
console.log('trustSafety tests passed');
