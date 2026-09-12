/** Server + localStorage keys for which table’s column layout is being edited (namespaced). */
export const TABLE_COLUMN_IDS = {
  adminUsers: 'admin_users',
  crmPipeline: 'crm_pipeline',
};

export const TABLE_COL_MIN_WIDTH = 56;
export const TABLE_COL_MAX_WIDTH = 480;
export const TABLE_COL_USER_MIN_WIDTH = 140;

export function minWidthForColumnKey(key) {
  return key === 'user' ? TABLE_COL_USER_MIN_WIDTH : TABLE_COL_MIN_WIDTH;
}

export function clampTableColumnWidth(width, { min = TABLE_COL_MIN_WIDTH, max = TABLE_COL_MAX_WIDTH } = {}) {
  const n = Number(width);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(max, Math.max(min, n)));
}

function serializedWidth(col) {
  return clampTableColumnWidth(col?.width, { min: minWidthForColumnKey(col?.key) });
}

function migrateLegacyAdminUserColumns(parsed, defaultMap) {
  if (!Array.isArray(parsed)) return [];
  if (!defaultMap.has('city') && !defaultMap.has('state')) return parsed;

  const hasCity = parsed.some((c) => c.key === 'city');
  const hasState = parsed.some((c) => c.key === 'state');
  const out = [];
  for (const col of parsed) {
    if (col.key === 'subscription') continue;
    if (col.key === 'location') {
      if (!hasCity) out.push({ ...col, key: 'city' });
      if (!hasState) out.push({ key: 'state', visible: col.visible !== false, width: 56 });
      continue;
    }
    out.push(col);
  }
  return out;
}

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
  const migrated = migrateLegacyAdminUserColumns(parsed, defaultMap);
  const fromSaved = migrated
    .map((c) => {
      const base = defaultMap.get(c.key);
      if (!base) return null;
      const width = serializedWidth({ key: c.key, width: c.width }) ?? serializedWidth(base);
      return {
        ...base,
        visible: c.visible !== false,
        ...(width != null ? { width } : {}),
      };
    })
    .filter(Boolean);
  const withZip = insertMissingColumnAfter(fromSaved, defaultMap, 'zip', 'state');
  const missing = defaultColumns.filter((c) => !withZip.some((x) => x.key === c.key));
  return [...withZip, ...missing];
}

function insertMissingColumnAfter(cols, defaultMap, key, afterKey) {
  if (!defaultMap.has(key) || cols.some((c) => c.key === key)) return cols;
  const def = defaultMap.get(key);
  const idx = cols.findIndex((c) => c.key === afterKey);
  if (idx === -1) return cols;
  const next = [...cols];
  next.splice(idx + 1, 0, { ...def });
  return next;
}

export function serializeTableColumns(cols) {
  return cols.map((c) => {
    const row = { key: c.key, visible: c.visible !== false };
    const width = serializedWidth(c);
    if (width != null) row.width = width;
    return row;
  });
}

export function normalizeSavedColumnsJson(saved) {
  if (!Array.isArray(saved)) return '';
  const normalized = saved.map((c) => {
    const row = {
      key: String(c.key),
      visible: c.visible !== false && c.visible !== 'false',
    };
    const width = serializedWidth(c);
    if (width != null) row.width = width;
    return row;
  });
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
