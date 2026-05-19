import assert from 'assert';
import {
  sortNotesForTimeline,
  prepareTimelineNotes,
  filterNotesForTimeline,
} from '../src/utils/crmDisplayAdapter.js';

const notes = [
  { id: 1, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z', contact_method: 'call' },
  { id: 2, created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-05T10:00:00Z', contact_method: 'email' },
  { id: 3, created_at: '2026-02-01T10:00:00Z', updated_at: '2026-02-01T10:00:00Z', contact_method: 'note', remind_at: '2026-06-01T09:00:00Z' },
];

function testNewestFirst() {
  const sorted = sortNotesForTimeline(notes, 'newest');
  assert.deepStrictEqual(sorted.map((n) => n.id), [2, 3, 1]);
}

function testOldestFirst() {
  const sorted = sortNotesForTimeline(notes, 'oldest');
  assert.deepStrictEqual(sorted.map((n) => n.id), [1, 3, 2]);
}

function testRecentlyUpdated() {
  const sorted = sortNotesForTimeline(notes, 'updated');
  assert.strictEqual(sorted[0].id, 2);
}

function testFilterAndSort() {
  const onlyCalls = prepareTimelineNotes(notes, 'calls', 'newest');
  assert.strictEqual(onlyCalls.length, 1);
  assert.strictEqual(onlyCalls[0].id, 1);
}

function testRemindersSort() {
  const sorted = sortNotesForTimeline(notes, 'reminders');
  assert.strictEqual(sorted[0].id, 3);
}

function run() {
  testNewestFirst();
  testOldestFirst();
  testRecentlyUpdated();
  testFilterAndSort();
  testRemindersSort();
  console.log('crmTimeline tests passed');
}

run();
