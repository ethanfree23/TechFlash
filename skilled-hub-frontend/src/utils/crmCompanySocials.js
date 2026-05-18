export const CRM_SOCIAL_TYPES = [
  { id: 'instagram', label: 'Instagram', field: 'instagram_url' },
  { id: 'facebook', label: 'Facebook', field: 'facebook_url' },
  { id: 'linkedin', label: 'LinkedIn', field: 'linkedin_url' },
];

export function socialRowsFromForm(form) {
  const rows = [];
  for (const t of CRM_SOCIAL_TYPES) {
    const url = String(form?.[t.field] || '').trim();
    if (url) rows.push({ type: t.id, url });
  }
  return rows;
}

export function applySocialRowsToForm(form, rows) {
  const next = { ...form };
  for (const t of CRM_SOCIAL_TYPES) {
    next[t.field] = '';
  }
  for (const row of rows || []) {
    const type = CRM_SOCIAL_TYPES.find((t) => t.id === row.type);
    if (type && String(row.url || '').trim()) {
      next[type.field] = String(row.url).trim();
    }
  }
  return next;
}
