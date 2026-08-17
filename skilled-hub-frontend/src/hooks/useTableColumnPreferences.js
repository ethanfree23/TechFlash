import { useState, useEffect, useRef, useMemo } from 'react';
import { authAPI } from '../api/api';
import { auth } from '../auth';
import {
  serializeTableColumns,
  normalizeSavedColumnsJson,
  columnsFromSavedArray,
  getSavedColumnsArrayForTable,
} from '../utils/tableColumnPrefs';

const LEGACY_ADMIN_USERS_KEY = 'admin_users_table_columns';

/**
 * Persist column visibility/order per logical table under user.ui_preferences.table_columns[tableId].
 */
export function useTableColumnPreferences({
  tableId,
  defaultColumns,
  user,
  onUserUpdate,
  onSaveError,
  localStorageKey,
}) {
  const [columns, setColumns] = useState(defaultColumns);
  /** When this matches `scopeKey`, column state is loaded for this table scope (avoids cross-tab persist bugs). */
  const [hydratedScopeKey, setHydratedScopeKey] = useState(null);
  const scopeKey = useMemo(
    () => `${tableId}:${localStorageKey}`,
    [tableId, localStorageKey]
  );
  const onUserUpdateRef = useRef(onUserUpdate);
  const onSaveErrorRef = useRef(onSaveError);
  onUserUpdateRef.current = onUserUpdate;
  onSaveErrorRef.current = onSaveError;

  useEffect(() => {
    if (!user) {
      setHydratedScopeKey(null);
      return;
    }

    let parsed = getSavedColumnsArrayForTable(user, tableId, LEGACY_ADMIN_USERS_KEY);
    if (!parsed) {
      try {
        const raw = window.localStorage.getItem(localStorageKey);
        if (raw) parsed = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      setColumns(columnsFromSavedArray(parsed, defaultColumns));
    } else {
      setColumns(defaultColumns);
    }
    setHydratedScopeKey(scopeKey);
  }, [user, tableId, defaultColumns, localStorageKey, scopeKey]);

  useEffect(() => {
    if (hydratedScopeKey !== scopeKey) return;
    try {
      window.localStorage.setItem(
        localStorageKey,
        JSON.stringify(columns.map((c) => ({ key: c.key, visible: c.visible })))
      );
    } catch {
      /* ignore */
    }
  }, [columns, localStorageKey, hydratedScopeKey, scopeKey]);

  useEffect(() => {
    if (hydratedScopeKey !== scopeKey || !user) return;
    if (auth.isMasquerading()) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (auth.isMasquerading()) return;

      const payload = serializeTableColumns(columns);
      const savedNested = user.ui_preferences?.table_columns?.[tableId];
      let compareTo = savedNested;
      if (!compareTo && tableId === 'admin_users_all') {
        compareTo = user.ui_preferences?.table_columns?.admin_users;
      }
      if (!compareTo && tableId === 'admin_users') {
        compareTo = user.ui_preferences?.admin_users_table_columns;
      }
      if (normalizeSavedColumnsJson(compareTo) === JSON.stringify(payload)) return;

      authAPI
        .updateMe(
          {
            ui_preferences: {
              table_columns: {
                [tableId]: payload,
              },
            },
          },
          { signal: controller.signal }
        )
        .then((res) => {
          if (controller.signal.aborted || auth.isMasquerading()) return;
          if (res?.user && auth.setUser(res.user)) {
            onUserUpdateRef.current?.(res.user);
          }
        })
        .catch((err) => {
          if (err?.name === 'AbortError' || controller.signal.aborted) return;
          onSaveErrorRef.current?.();
        });
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [columns, user, tableId, hydratedScopeKey, scopeKey]);

  return [columns, setColumns];
}
