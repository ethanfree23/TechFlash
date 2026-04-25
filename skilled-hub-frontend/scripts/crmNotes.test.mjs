import assert from 'assert';
import {
  emptyNoteDraft,
  noteDraftForReply,
  noteDraftForEdit,
  noteWasEdited,
} from '../src/utils/crmNotes.js';

function testEmptyDraft() {
  const draft = emptyNoteDraft();
  assert.strictEqual(draft.id, null);
  assert.strictEqual(draft.parent_note_id, null);
  assert.strictEqual(draft.contact_method, 'note');
  assert.strictEqual(draft.made_contact, false);
  assert.strictEqual(draft.title, '');
  assert.strictEqual(draft.body, '');
}

function testReplyDraft() {
  const draft = noteDraftForReply(42);
  assert.strictEqual(draft.parent_note_id, 42);
  assert.strictEqual(draft.id, null);
  assert.strictEqual(draft.contact_method, 'note');
}

function testEditDraft() {
  const source = {
    id: 9,
    parent_note_id: 3,
    contact_method: 'email',
    made_contact: true,
    title: 'Follow up',
    body: 'Reached them over email.',
  };
  const draft = noteDraftForEdit(source);
  assert.strictEqual(draft.id, 9);
  assert.strictEqual(draft.parent_note_id, 3);
  assert.strictEqual(draft.contact_method, 'email');
  assert.strictEqual(draft.made_contact, true);
  assert.strictEqual(draft.title, 'Follow up');
  assert.strictEqual(draft.body, 'Reached them over email.');
}

function testEditedDetection() {
  const created = '2026-04-25T10:00:00Z';
  assert.strictEqual(
    noteWasEdited({ created_at: created, updated_at: created }),
    false,
    'same timestamps should not count as edited',
  );
  assert.strictEqual(
    noteWasEdited({ created_at: created, updated_at: '2026-04-25T10:05:00Z' }),
    true,
    'later updated time should count as edited',
  );
}

function run() {
  testEmptyDraft();
  testReplyDraft();
  testEditDraft();
  testEditedDetection();
  // eslint-disable-next-line no-console
  console.log('crmNotes tests passed');
}

run();
