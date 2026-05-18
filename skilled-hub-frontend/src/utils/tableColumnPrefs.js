/** Server + localStorage keys for which table’s column layout is being edited (namespaced). */
export const TABLE_COLUMN_IDS = {
  adminUsers: 'admin_users',
  crmPipeline: 'crm_pipeline',
};

/** Admin Users tabs each get their own saved column layout. */
export function adminUsersTableId(roleTab) {
  const safe = [
    'all', 'technicians', 'company', 'admins', 'pending', 'flagged', 'suspended', 'recently_active',
    // legacy tab ids
    'technician',
  ].includes(roleTab) ? roleTab : 'all';
  const normalized = safe === 'technician' ? 'technicians' : safe;
  return `admin_users_${normalized}`;
}

export function columnsFromSavedArray(parsed, defaultColumns) {
  const defaultMap = new Map(defaultColumns.map((c) => [c.key, c]));
  const fromSaved = parsed
    .map((c) => {
      const base = defaultMap.get(c.key);
      if (!base) return null;
      return { ...base, visible: c.visible !== false };
    })
    .filter(Boolean);
  const missing = defaultColumns.filter((c) => !fromSaved.some((x) => x.key === c.key));
  return [...fromSaved, ...missing];
}

export function serializeTableColumns(cols) {
  return cols.map((c) => ({ key: c.key, visible: c.visible !== false }));
}

export function normalizeSavedColumnsJson(saved) {
  if (!Array.isArray(saved)) return '';
  const normalized = saved.map((c) => ({
    key: String(c.key),
    visible: c.visible !== false && c.visible !== 'false',
  }));
  return JSON.stringify(normalized);
}

/** Resolve saved column array from user prefs + legacy shapes. */
export function getSavedColumnsArrayForTable(user, tableId, legacyFlatKey = null) {
  const tc = user?.ui_preferences?.table_columns || {};
  const fromNested = tc[tableId];
  if (Array.isArray(fromNested) && fromNested.length > 0) return fromNested;

  // Migrate former single layout (admin_users) onto the "All" tab only.
  if (tableId === 'admin_users_all') {
    const legacySingle = tc[TABLE_COLUMN_IDS.adminUsers];
    if (Array.isArray(legacySingle) && legacySingle.length > 0) return legacySingle;
    if (legacyFlatKey) {
      const legacy = user?.ui_preferences?.[legacyFlatKey];
      if (Array.isArray(legacy) && legacy.length > 0) return legacy;
    }
  }

  if (legacyFlatKey && tableId === TABLE_COLUMN_IDS.adminUsers) {
    const legacy = user?.ui_preferences?.[legacyFlatKey];
    if (Array.isArray(legacy) && legacy.length > 0) return legacy;
  }
  return null;
}
