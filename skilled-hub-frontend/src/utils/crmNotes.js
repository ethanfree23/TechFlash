export function emptyNoteDraft() {
  return {
    id: null,
    parent_note_id: null,
    contact_method: 'note',
    made_contact: false,
    title: '',
    body: '',
  };
}

export function noteDraftForReply(parentNoteId) {
  return {
    ...emptyNoteDraft(),
    parent_note_id: parentNoteId,
  };
}

export function noteDraftForEdit(note) {
  return {
    id: note?.id ?? null,
    parent_note_id: note?.parent_note_id ?? null,
    contact_method: note?.contact_method || 'note',
    made_contact: Boolean(note?.made_contact),
    title: note?.title || '',
    body: note?.body || '',
  };
}

export function noteWasEdited(note) {
  if (!note?.created_at || !note?.updated_at) return false;
  return new Date(note.updated_at).getTime() > new Date(note.created_at).getTime();
}
