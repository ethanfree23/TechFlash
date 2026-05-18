import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { adminUsersAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import AdminCreateUserModal from '../components/AdminCreateUserModal';
import { auth } from '../auth';
import { FaCog, FaEye, FaSearch, FaUserPlus } from 'react-icons/fa';
import { useTableColumnPreferences } from '../hooks/useTableColumnPreferences';
import { adminUsersTableId } from '../utils/tableColumnPrefs';

const ROLE_TABS = [
  { id: 'all', label: 'All accounts' },
  { id: 'company', label: 'Company logins' },
  { id: 'technician', label: 'Technicians' },
];
const COLUMN_STORAGE_KEY = 'admin-users-table-columns-v2';
const DEFAULT_COLUMNS = [
  { key: 'company', label: 'Company', visible: true },
  { key: 'first_name', label: 'First name', visible: true },
  { key: 'last_name', label: 'Last name', visible: true },
  { key: 'email', label: 'Email', visible: true },
  { key: 'phone', label: 'Phone', visible: true },
  { key: 'role', label: 'User type', visible: true },
  { key: 'joined', label: 'Joined', visible: true },
  { key: 'logins_30d', label: 'Logins (30d)', visible: true },
];

function formatUserType(role) {
  if (role === 'company') return 'Company';
  if (role === 'technician') return 'Technician';
  if (role === 'admin') return 'Admin';
  return role ? String(role) : '—';
}

export default function AdminUsersPage({ user, onLogout, onUserUpdate }) {
  const [roleTab, setRoleTab] = useState('all');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const searchTimer = useRef(null);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'success',
  });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [masqueradeBusyId, setMasqueradeBusyId] = useState(null);
  const [firstNameFilter, setFirstNameFilter] = useState('');
  const [lastNameFilter, setLastNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [columnRoleFilter, setColumnRoleFilter] = useState('');
  const [joinedFilter, setJoinedFilter] = useState('');
  const [loginsMinFilter, setLoginsMinFilter] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [sortKeyOverride, setSortKeyOverride] = useState(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [draggingColumnKey, setDraggingColumnKey] = useState(null);
  const columnConfigRef = useRef(null);
  const columnsButtonRef = useRef(null);

  useEffect(() => {
    if (!showColumnConfig) return undefined;
    const onMouseDown = (e) => {
      const t = e.target;
      if (columnConfigRef.current?.contains(t) || columnsButtonRef.current?.contains(t)) return;
      setShowColumnConfig(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showColumnConfig]);

  const handleColumnSaveError = useCallback(() => {
    setAlertModal({
      isOpen: true,
      title: 'Could not save column settings',
      message: 'Your column layout was kept on this device only. Try again later.',
      variant: 'error',
    });
  }, []);

  const [columns, setColumns] = useTableColumnPreferences({
    tableId: adminUsersTableId(roleTab),
    defaultColumns: DEFAULT_COLUMNS,
    user,
    onUserUpdate,
    onSaveError: handleColumnSaveError,
    localStorageKey: `${COLUMN_STORAGE_KEY}-${roleTab}`,
  });

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQ]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminUsersAPI.list({
        q: debouncedQ || undefined,
        role: roleTab === 'all' ? 'all' : roleTab,
      });
      setList(res.users || []);
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not load users',
        message: e.message || 'Failed',
        variant: 'error',
      });
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, roleTab]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadUsers();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadUsers]);

  useEffect(() => {
    setSortKeyOverride(null);
  }, [roleTab]);

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const effectiveSortKey = useMemo(() => {
    const keys = visibleColumns.map((c) => c.key);
    if (sortKeyOverride && keys.includes(sortKeyOverride)) return sortKeyOverride;
    return keys[0];
  }, [visibleColumns, sortKeyOverride]);

  useEffect(() => {
    if (sortKeyOverride && !visibleColumns.some((c) => c.key === sortKeyOverride)) {
      setSortKeyOverride(null);
    }
  }, [visibleColumns, sortKeyOverride]);

  useEffect(() => {
    setSortDir('asc');
  }, [effectiveSortKey, roleTab]);

  const sortKeys = useMemo(() => {
    const keys = visibleColumns.map((c) => c.key);
    if (!keys.length) return [];
    const primary = keys.includes(effectiveSortKey) ? effectiveSortKey : keys[0];
    return [primary, ...keys.filter((k) => k !== primary)];
  }, [visibleColumns, effectiveSortKey]);

  const startMasquerade = async (e, targetUserId) => {
    e.stopPropagation();
    setMasqueradeBusyId(targetUserId);
    try {
      const res = await adminUsersAPI.masqueradeStart(targetUserId);
      auth.enterMasquerade(res.token, res.user);
      window.location.assign('/dashboard');
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Masquerade failed',
        message: err.message || 'Could not start masquerade session',
        variant: 'error',
      });
    } finally {
      setMasqueradeBusyId(null);
    }
  };

  const filteredList = list.filter((row) => {
    const rowFirst = (row.first_name || '').toLowerCase();
    const rowLast = (row.last_name || '').toLowerCase();
    const rowEmail = (row.email || '').toLowerCase();
    const rowPhone = (row.phone || '').toLowerCase();
    const rowCompany = (row.company_name || '').toLowerCase();
    if (firstNameFilter.trim() && !rowFirst.includes(firstNameFilter.trim().toLowerCase())) return false;
    if (lastNameFilter.trim() && !rowLast.includes(lastNameFilter.trim().toLowerCase())) return false;
    if (emailFilter.trim() && !rowEmail.includes(emailFilter.trim().toLowerCase())) return false;
    if (phoneFilter.trim() && !rowPhone.includes(phoneFilter.trim().toLowerCase())) return false;
    if (companyFilter.trim() && !rowCompany.includes(companyFilter.trim().toLowerCase())) return false;
    if (columnRoleFilter && String(row.role || '') !== columnRoleFilter) return false;
    if (joinedFilter.trim()) {
      const j = joinedFilter.trim().toLowerCase();
      const iso = (row.created_at && String(row.created_at).toLowerCase()) || '';
      const pretty = row.created_at
        ? new Date(row.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : '';
      if (!iso.includes(j) && !pretty.toLowerCase().includes(j)) return false;
    }
    if (loginsMinFilter.trim()) {
      const min = parseInt(loginsMinFilter.trim(), 10);
      if (Number.isFinite(min) && Number(row.logins_last_30_days ?? 0) < min) return false;
    }
    return true;
  });

  const togglePrimarySort = () => {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  };

  const onSortHeaderClick = (colKey) => {
    if (colKey === effectiveSortKey) togglePrimarySort();
    else {
      setSortKeyOverride(colKey);
      setSortDir('asc');
    }
  };

  const clearColumnFilters = () => {
    setFirstNameFilter('');
    setLastNameFilter('');
    setEmailFilter('');
    setPhoneFilter('');
    setCompanyFilter('');
    setColumnRoleFilter('');
    setJoinedFilter('');
    setLoginsMinFilter('');
  };

  const sortedList = [...filteredList].sort((a, b) => {
    if (!sortKeys.length) return 0;

    const getRawValue = (row, key) => {
      switch (key) {
        case 'first_name':
          return row.first_name ?? '';
        case 'last_name':
          return row.last_name ?? '';
        case 'email':
          return row.email ?? '';
        case 'phone':
          return row.phone ?? '';
        case 'company':
          return row.company_name ?? '';
        case 'role':
          return row.role ?? '';
        case 'joined':
          return row.created_at ?? '';
        case 'logins_30d':
          return String(row.logins_last_30_days ?? 0);
        default:
          return '';
      }
    };

    const classifyValue = (value) => {
      const normalized = String(value ?? '').trim();
      if (!normalized || normalized === '-' || normalized === '—') return 2;
      if (/^\d+(\.\d+)?$/.test(normalized)) return 1;
      return 0;
    };

    const compareByColumn = (left, right, key, direction = 1) => {
      if (key === 'joined') {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
        return (leftTime - rightTime) * direction;
      }

      if (key === 'logins_30d') {
        const leftNum = Number(left.logins_last_30_days ?? 0);
        const rightNum = Number(right.logins_last_30_days ?? 0);
        return (leftNum - rightNum) * direction;
      }

      const leftRaw = getRawValue(left, key);
      const rightRaw = getRawValue(right, key);
      const leftClass = classifyValue(leftRaw);
      const rightClass = classifyValue(rightRaw);
      if (leftClass !== rightClass) return leftClass - rightClass;

      if (leftClass === 1) {
        const leftNum = Number(leftRaw);
        const rightNum = Number(rightRaw);
        return (leftNum - rightNum) * direction;
      }

      const leftStr = String(leftRaw).toLowerCase();
      const rightStr = String(rightRaw).toLowerCase();
      return leftStr.localeCompare(rightStr, undefined, { sensitivity: 'base' }) * direction;
    };

    const primaryDir = sortDir === 'asc' ? 1 : -1;
    for (let i = 0; i < sortKeys.length; i++) {
      const key = sortKeys[i];
      const direction = i === 0 ? primaryDir : 1;
      const cmp = compareByColumn(a, b, key, direction);
      if (cmp !== 0) return cmp;
    }
    return (a.id ?? 0) - (b.id ?? 0);
  });
  const moveColumn = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setColumns((prev) => {
      const fromIdx = prev.findIndex((c) => c.key === fromKey);
      const toIdx = prev.findIndex((c) => c.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };
  const toggleColumnVisible = (key) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="users" emailVariant="crm" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-1">
              One row per login account. Technicians and company contact logins are listed here; several employees at the
              same company each appear as their own row when they have separate logins. Open a row for analytics and admin
              actions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 shrink-0 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm"
          >
            <FaUserPlus className="w-4 h-4" aria-hidden />
            Create user
          </button>
        </div>

        <AdminCreateUserModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          presetCompanyProfile={null}
          onCompleted={async ({ kind, passwordSet }) => {
            await loadUsers();
            const messages = {
              company_link:
                passwordSet
                  ? 'Company contact login created and linked to the selected company account. The password was set during creation.'
                  : 'Company contact login created and linked to the selected company account. They were emailed a secure password setup link.',
              company_new:
                passwordSet
                  ? 'Company user created. A CRM record was added as Prospect until they post their first job (then it becomes Customer). The contact password was set during creation.'
                  : 'Company user created. A CRM record was added as Prospect until they post their first job (then it becomes Customer). They were emailed “Welcome aboard” with a link to set a secure password.',
              technician:
                passwordSet
                  ? 'Technician account created and password set during creation.'
                  : 'They receive an email with a link to set their password. Until then they can sign in using their email-derived temporary password.',
            };
            setAlertModal({
              isOpen: true,
              title: 'User created',
              message: messages[kind] || 'User created.',
              variant: 'success',
            });
          }}
          onError={(msg) =>
            setAlertModal({
              isOpen: true,
              title: 'Create failed',
              message: msg || 'Could not create user',
              variant: 'error',
            })
          }
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {ROLE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRoleTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                roleTab === t.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative mb-4">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          <input
            type="search"
            placeholder="Search by email…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-3">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Column filters</span>
            <button
              type="button"
              onClick={clearColumnFilters}
              className="text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              Clear filters
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2">
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">First name</span>
              <input
                type="search"
                value={firstNameFilter}
                onChange={(e) => setFirstNameFilter(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Last name</span>
              <input
                type="search"
                value={lastNameFilter}
                onChange={(e) => setLastNameFilter(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Email</span>
              <input
                type="search"
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Phone</span>
              <input
                type="search"
                value={phoneFilter}
                onChange={(e) => setPhoneFilter(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Company</span>
              <input
                type="search"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">User type</span>
              <select
                value={columnRoleFilter}
                onChange={(e) => setColumnRoleFilter(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="">All types</option>
                <option value="company">Company</option>
                <option value="technician">Technician</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Joined contains</span>
              <input
                type="search"
                value={joinedFilter}
                onChange={(e) => setJoinedFilter(e.target.value)}
                placeholder="e.g. May 2026"
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Logins (30d) min</span>
              <input
                type="number"
                min={0}
                step={1}
                value={loginsMinFilter}
                onChange={(e) => setLoginsMinFilter(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end mb-2 relative">
          <button
            ref={columnsButtonRef}
            type="button"
            onClick={() => setShowColumnConfig((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 bg-white rounded-lg hover:bg-gray-50"
          >
            <FaCog className="w-4 h-4" aria-hidden />
            Columns
          </button>
          {showColumnConfig && (
            <div ref={columnConfigRef} className="absolute right-0 top-10 z-30 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
              <div className="text-xs text-gray-500 mb-2">
                <button type="button" onClick={() => setShowColumnConfig(false)} className="float-right text-gray-500 hover:text-gray-800 text-sm" aria-label="Close">×</button>
                Toggle visibility and drag to reorder columns.
              </div>
              <ul className="space-y-2 max-h-72 overflow-auto">
                {columns.map((col) => (
                  <li
                    key={col.key}
                    draggable
                    onDragStart={() => setDraggingColumnKey(col.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      moveColumn(draggingColumnKey, col.key);
                      setDraggingColumnKey(null);
                    }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2 py-1.5 bg-gray-50"
                  >
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={() => toggleColumnVisible(col.key)}
                      />
                      <span>{col.label}</span>
                    </label>
                    <span className="text-gray-400 text-xs">drag</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {visibleColumns.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      {col.key === effectiveSortKey ? (
                        <button
                          type="button"
                          onClick={() => onSortHeaderClick(col.key)}
                          className="inline-flex items-center gap-1"
                        >
                          {col.label} {sortDir === 'asc' ? '▲' : '▼'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSortHeaderClick(col.key)}
                          className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                        >
                          {col.label} <span className="text-gray-400 font-normal">↕</span>
                        </button>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-gray-500 text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-gray-500 text-sm">
                      No users match.
                    </td>
                  </tr>
                ) : (
                  sortedList.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      {visibleColumns.map((col) => (
                        <td key={`${row.id}-${col.key}`} className="px-4 py-3 text-sm text-gray-700">
                          {col.key === 'first_name' ? (
                            <Link to={`/admin/users/${row.id}`} className="text-blue-700 hover:text-blue-900 hover:underline">
                              {row.first_name || '—'}
                            </Link>
                          ) : col.key === 'last_name' ? (
                            <Link to={`/admin/users/${row.id}`} className="text-blue-700 hover:text-blue-900 hover:underline">
                              {row.last_name || '—'}
                            </Link>
                          ) : col.key === 'email' ? (
                            <div>
                              <div>{row.email || '—'}</div>
                              <div className="text-xs text-gray-500">#{row.id}</div>
                            </div>
                          ) : col.key === 'phone' ? (
                            row.phone || '—'
                          ) : col.key === 'company' ? (
                            row.company_profile_id ? (
                              <Link
                                to={`/companies/${row.company_profile_id}`}
                                className="text-blue-700 hover:text-blue-900 hover:underline"
                              >
                                {row.company_name || `Company #${row.company_profile_id}`}
                              </Link>
                            ) : (
                              '—'
                            )
                          ) : col.key === 'role' ? (
                            formatUserType(row.role)
                          ) : col.key === 'joined' ? (
                            row.created_at
                              ? new Date(row.created_at).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'
                          ) : col.key === 'logins_30d' ? (
                            Number(row.logins_last_30_days ?? 0)
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            to={`/admin/users/${row.id}`}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View →
                          </Link>
                          {(row.role === 'company' || row.role === 'technician') && (
                            <button
                              type="button"
                              disabled={masqueradeBusyId === row.id}
                              onClick={(e) => startMasquerade(e, row.id)}
                              title="View as this user"
                              aria-label="View as this user"
                              className="inline-flex items-center justify-center p-2 rounded-lg border border-amber-300 text-amber-800 bg-amber-50/80 hover:bg-amber-100 hover:border-amber-400 disabled:opacity-50"
                            >
                              {masqueradeBusyId === row.id ? (
                                <span className="text-xs font-semibold w-[1.125rem] text-center">…</span>
                              ) : (
                                <FaEye className="text-base" aria-hidden />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
        onClose={() => setAlertModal((m) => ({ ...m, isOpen: false }))}
      />
    </div>
  );
}
