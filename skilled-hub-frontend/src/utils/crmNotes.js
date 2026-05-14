export function emptyNoteDraft() {
  return {
    id: null,
    parent_note_id: null,
    contact_method: 'note',
    made_contact: false,
    title: '',
    body: '',
    remind_at: '',
  };
}

export function noteDraftForReply(parentNoteId) {
  return {
    ...emptyNoteDraft(),
    parent_note_id: parentNoteId,
  };
}

export function noteDraftForEdit(note) {
  const ra = note?.remind_at;
  let remindAt = '';
  if (ra) {
    const d = new Date(ra);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      remindAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return {
    id: note?.id ?? null,
    parent_note_id: note?.parent_note_id ?? null,
    contact_method: note?.contact_method || 'note',
    made_contact: Boolean(note?.made_contact),
    title: note?.title || '',
    body: note?.body || '',
    remind_at: remindAt,
  };
}

export function noteWasEdited(note) {
  if (!note?.created_at || !note?.updated_at) return false;
  return new Date(note.updated_at).getTime() > new Date(note.created_at).getTime();
}
