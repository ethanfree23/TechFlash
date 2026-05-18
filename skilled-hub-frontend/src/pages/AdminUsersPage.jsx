import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import { adminUsersAPI, adminAPI } from '../api/api';
import { auth } from '../auth';
import { useTableColumnPreferences } from '../hooks/useTableColumnPreferences';
import { adminUsersTableId } from '../utils/tableColumnPrefs';
import {
  enrichUserRow,
  computeKpis,
  computeTabCounts,
  getApiRoleForTab,
  applyTabFilter,
  applyAdvancedFilters,
  applyClientSearch,
  DEFAULT_TABLE_COLUMNS,
  resolveEmptyVariant,
} from '../utils/adminUsersDisplayAdapter';
import { exportUsersToCsv } from '../utils/adminUsersExport';
import UsersHeader from '../components/admin/users/UsersHeader';
import UsersKpiCards from '../components/admin/users/UsersKpiCards';
import UsersSegmentedTabs from '../components/admin/users/UsersSegmentedTabs';
import UsersSavedViews from '../components/admin/users/UsersSavedViews';
import UsersFilters from '../components/admin/users/UsersFilters';
import UsersTable from '../components/admin/users/UsersTable';
import UserDrawer from '../components/admin/users/UserDrawer';
import BulkActionBar from '../components/admin/users/BulkActionBar';
import CreateUserModal from '../components/admin/users/CreateUserModal';
import InviteUserModal from '../components/admin/users/InviteUserModal';
import SendUserEmailModal from '../components/admin/users/SendUserEmailModal';
import AdminActionPlaceholderModal from '../components/admin/users/AdminActionPlaceholderModal';

const COLUMN_STORAGE_KEY = 'admin-users-table-columns-v3';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AdminUsersPage({ user, onLogout, onUserUpdate }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [activeViewId, setActiveViewId] = useState('all');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const debouncedSearch = useDebouncedValue(searchQ);
  const [filters, setFilters] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [sortKey, setSortKey] = useState('user');
  const [sortDir, setSortDir] = useState('asc');
  const [masqueradeBusyId, setMasqueradeBusyId] = useState(null);
  const [techInsights, setTechInsights] = useState(null);
  const [draggingColumnKey, setDraggingColumnKey] = useState(null);
  const [placeholderAction, setPlaceholderAction] = useState(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [emailModalUsers, setEmailModalUsers] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' });

  const handleColumnSaveError = useCallback(() => {
    setAlertModal({
      isOpen: true,
      title: 'Could not save column settings',
      message: 'Your column layout was kept on this device only.',
      variant: 'error',
    });
  }, []);

  const [columns, setColumns] = useTableColumnPreferences({
    tableId: adminUsersTableId(activeTab),
    defaultColumns: DEFAULT_TABLE_COLUMNS,
    user,
    onUserUpdate,
    onSaveError: handleColumnSaveError,
    localStorageKey: `${COLUMN_STORAGE_KEY}-${activeTab}`,
  });

  const apiRole = getApiRoleForTab(activeTab);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminUsersAPI.list({
        role: apiRole === null ? 'all' : apiRole,
        q: debouncedSearch.trim() || undefined,
      });
      setList(res.users || []);
    } catch (e) {
      setLoadError(e.message || 'Failed to load users');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [apiRole, debouncedSearch]);

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
    adminAPI.getPlatformInsights('technicians', '30d').then(setTechInsights).catch(() => {});
  }, []);

  const enriched = useMemo(() => list.map((row) => enrichUserRow(row)), [list]);

  const filteredRows = useMemo(() => {
    let rows = applyTabFilter(enriched, activeTab);
    rows = applyAdvancedFilters(rows, filters);
    rows = applyClientSearch(rows, searchQ);
    return rows;
  }, [enriched, activeTab, filters, searchQ]);

  const kpis = useMemo(() => computeKpis(enriched, techInsights), [enriched, techInsights]);
  const tabCounts = useMemo(() => computeTabCounts(enriched), [enriched]);

  const drawerRow = useMemo(
    () => (drawerUserId ? enriched.find((r) => r.id === drawerUserId) : null),
    [drawerUserId, enriched]
  );

  const hasFilters = Object.keys(filters).length > 0;
  const hasSearch = !!searchQ.trim();

  const emptyVariant = useMemo(
    () =>
      resolveEmptyVariant({
        loadError: !!loadError,
        hasSearch,
        hasFilters,
        activeTab,
        totalLoaded: list.length,
      }),
    [loadError, hasSearch, hasFilters, activeTab, list.length]
  );

  const clearAllFilters = useCallback(() => {
    setSearchQ('');
    setFilters({});
    setActiveTab('all');
    setActiveViewId('all');
    setSelectedIds(new Set());
  }, []);

  const handleKpiClick = (cardId) => {
    const map = {
      total: 'all',
      technicians: 'technicians',
      companies: 'company',
      active: 'recently_active',
      pending: 'pending',
      flagged: 'flagged',
    };
    if (map[cardId]) {
      setActiveTab(map[cardId]);
      setActiveViewId('all');
    }
  };

  const handleSelectView = (view) => {
    setActiveViewId(view.id);
    setActiveTab(view.tab);
    setFilters(view.filters || {});
  };

  const handleEmptyAction = () => {
    if (emptyVariant === 'error') loadUsers();
    else if (emptyVariant === 'no_users') setCreateModalOpen(true);
    else if (emptyVariant === 'search' || emptyVariant === 'filtered') clearAllFilters();
    else {
      setActiveTab('all');
      setActiveViewId('all');
    }
  };

  const handleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked) => {
    if (checked) setSelectedIds(new Set(filteredRows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const startMasquerade = async (targetUserId) => {
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

  const handleResetPassword = async (targetUser) => {
    const users = Array.isArray(targetUser) ? targetUser : [targetUser];
    try {
      for (const u of users) {
        await adminUsersAPI.sendPasswordSetup(u.id, { sendEmail: true });
      }
      setAlertModal({
        isOpen: true,
        title: 'Password setup sent',
        message: `Setup email sent to ${users.length} user(s).`,
        variant: 'success',
      });
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Failed', message: e.message, variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminUsersAPI.destroy(deleteTarget.id);
      setDeleteTarget(null);
      setDrawerUserId(null);
      await loadUsers();
      setAlertModal({ isOpen: true, title: 'User deleted', message: 'The account was removed.', variant: 'success' });
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Delete failed', message: e.message, variant: 'error' });
    }
  };

  const handleExport = (rows) => {
    exportUsersToCsv(rows.length ? rows : filteredRows);
  };

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

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const selectedUsers = filteredRows.filter((r) => selectedIds.has(r.id));

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <AppHeader user={user} onLogout={onLogout} activePage="users" emailVariant="crm" />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <UsersHeader
          onCreateUser={() => setCreateModalOpen(true)}
          onInviteUser={() => setInviteModalOpen(true)}
          onExport={() => handleExport(selectedUsers.length ? selectedUsers : filteredRows)}
          onRefresh={loadUsers}
          onClearFilters={clearAllFilters}
        />

        <UsersKpiCards kpis={kpis} loading={loading && list.length === 0 && !loadError} onCardClick={handleKpiClick} />

        <UsersSegmentedTabs activeTab={activeTab} tabCounts={tabCounts} onChange={(tab) => { setActiveTab(tab); setActiveViewId('all'); }} />

        <UsersSavedViews activeViewId={activeViewId} onSelectView={handleSelectView} />

        <UsersFilters
          searchQ={searchQ}
          onSearchChange={setSearchQ}
          filters={filters}
          onFiltersChange={setFilters}
          onClear={clearAllFilters}
          columns={columns}
          onMoveColumn={moveColumn}
          onToggleColumn={toggleColumnVisible}
          draggingColumnKey={draggingColumnKey}
          setDraggingColumnKey={setDraggingColumnKey}
        />

        <UsersTable
          rows={filteredRows}
          columns={columns}
          loading={loading}
          loadError={loadError}
          emptyVariant={emptyVariant}
          onEmptyAction={handleEmptyAction}
          onRetry={loadUsers}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onRowClick={(row) => setDrawerUserId(row.id)}
          onViewProfile={(row) => navigate(`/admin/users/${row.id}`)}
          onMasquerade={startMasquerade}
          onSendEmail={(u) => setEmailModalUsers(u)}
          onResetPassword={handleResetPassword}
          onDelete={(u) => setDeleteTarget(u)}
          onPlaceholderAction={setPlaceholderAction}
          masqueradeBusyId={masqueradeBusyId}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      </main>

      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onExport={() => handleExport(selectedUsers)}
        onSendEmail={() => setEmailModalUsers(selectedUsers)}
        onResetPassword={() => handleResetPassword(selectedUsers)}
        onPlaceholderAction={setPlaceholderAction}
        onDelete={() => {
          if (selectedUsers.length === 1) setDeleteTarget(selectedUsers[0]);
          else setAlertModal({
            isOpen: true,
            title: 'Bulk delete',
            message: 'Select a single user to delete, or delete individually from the actions menu.',
            variant: 'error',
          });
        }}
      />

      {drawerUserId && (
        <UserDrawer
          userId={drawerUserId}
          listRow={drawerRow}
          onClose={() => setDrawerUserId(null)}
          onSendEmail={(u) => setEmailModalUsers(u)}
          onMasquerade={startMasquerade}
          onResetPassword={handleResetPassword}
          onDelete={(u) => setDeleteTarget(u)}
          onPlaceholderAction={setPlaceholderAction}
          masqueradeBusyId={masqueradeBusyId}
        />
      )}

      <AdminActionPlaceholderModal
        isOpen={!!placeholderAction}
        actionLabel={placeholderAction}
        onClose={() => setPlaceholderAction(null)}
      />

      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        presetCompanyProfile={null}
        onCompleted={async ({ kind, passwordSet }) => {
          await loadUsers();
          const messages = {
            company_link: passwordSet ? 'Company login created with password set.' : 'Company login created — setup email sent.',
            company_new: passwordSet ? 'Company user created with password set.' : 'Company user created — welcome email sent.',
            technician: passwordSet ? 'Technician created with password set.' : 'Technician created — setup email sent.',
          };
          setAlertModal({ isOpen: true, title: 'User created', message: messages[kind] || 'User created.', variant: 'success' });
        }}
        onError={(msg) => setAlertModal({ isOpen: true, title: 'Create failed', message: msg, variant: 'error' })}
      />

      <InviteUserModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onSuccess={(msg) => {
          loadUsers();
          setAlertModal({ isOpen: true, title: 'Invites sent', message: msg, variant: 'success' });
        }}
        onError={(msg) => setAlertModal({ isOpen: true, title: 'Invite failed', message: msg, variant: 'error' })}
      />

      <SendUserEmailModal
        isOpen={!!emailModalUsers}
        users={emailModalUsers}
        onClose={() => setEmailModalUsers(null)}
        onSuccess={(msg) => setAlertModal({ isOpen: true, title: 'Email sent', message: msg, variant: 'success' })}
        onError={(msg) => setAlertModal({ isOpen: true, title: 'Email failed', message: msg, variant: 'error' })}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete user?"
        message={`Permanently delete ${deleteTarget?.displayName || deleteTarget?.email || 'this user'}? This cannot be undone.`}
        confirmLabel="Delete user"
        variant="destructive"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

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
