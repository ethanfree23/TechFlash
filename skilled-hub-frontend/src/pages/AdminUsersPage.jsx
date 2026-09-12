import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AppFooter from '../components/layout/AppFooter';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import { adminUsersAPI, adminAPI } from '../api/api';
import { auth } from '../auth';
import { useTableColumnPreferences } from '../hooks/useTableColumnPreferences';
import { adminUsersTableId, clampTableColumnWidth, minWidthForColumnKey } from '../utils/tableColumnPrefs';
import {
  enrichUserRow,
  computeKpis,
  computeTabCounts,
  applyTabFilter,
  applyAdvancedFilters,
  applyClientSearch,
  defaultColumnsForTab,
  resolveEmptyVariant,
} from '../utils/adminUsersDisplayAdapter';
import { exportUsersToCsv } from '../utils/adminUsersExport';
import UsersHeader from '../components/admin/users/UsersHeader';
import UsersKpiCards from '../components/admin/users/UsersKpiCards';
import UsersSegmentedTabs from '../components/admin/users/UsersSegmentedTabs';
import UsersFilters from '../components/admin/users/UsersFilters';
import UsersTable from '../components/admin/users/UsersTable';
import UserDrawer from '../components/admin/users/UserDrawer';
import BulkActionBar from '../components/admin/users/BulkActionBar';
import CreateUserModal from '../components/admin/users/CreateUserModal';
import InviteUserModal from '../components/admin/users/InviteUserModal';
import SendUserEmailModal from '../components/admin/users/SendUserEmailModal';
import SendUserSmsModal from '../components/admin/users/SendUserSmsModal';
import AdminActionPlaceholderModal from '../components/admin/users/AdminActionPlaceholderModal';
import LicenseDocumentModal from '../components/settings/LicenseDocumentModal';
import { presentLicenseCard } from '../utils/licenseCredentials';
import { withDemoPath } from '../utils/demoMode';

const COLUMN_STORAGE_KEY = 'admin-users-table-columns-v5';

export default function AdminUsersPage({ user, onLogout, onUserUpdate }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [activeViewId, setActiveViewId] = useState('all');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQ, setSearchQ] = useState('');
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
  const [smsTarget, setSmsTarget] = useState(null);
  const [licenseCard, setLicenseCard] = useState(null);
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

  const defaultColumns = useMemo(() => defaultColumnsForTab(activeTab), [activeTab]);

  const [columns, setColumns] = useTableColumnPreferences({
    tableId: adminUsersTableId(activeTab),
    defaultColumns,
    user,
    onUserUpdate,
    onSaveError: handleColumnSaveError,
    localStorageKey: `${COLUMN_STORAGE_KEY}-${activeTab}`,
  });

  const loadSeqRef = useRef(0);
  const abortRef = useRef(null);

  const loadUsers = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      // Always load the full census so KPI/tab totals stay stable when switching views.
      const res = await adminUsersAPI.list({
        role: 'all',
        signal: controller.signal,
      });
      if (seq !== loadSeqRef.current) return;
      setList(res.users || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (seq !== loadSeqRef.current) return;
      setLoadError(e.message || 'Failed to load users');
      setList([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, []);

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
    if (searchQ.trim()) {
      rows = applyClientSearch(rows, searchQ);
    }
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
    setActiveTab(view.tab || 'all');
    setFilters(view.filters || {});
  };

  const handleEmptyAction = () => {
    if (emptyVariant === 'error') loadUsers();
    else if (emptyVariant === 'no_users') setCreateModalOpen(true);
    else if (emptyVariant === 'search') setSearchQ('');
    else if (emptyVariant === 'filtered') {
      setFilters({});
      setSelectedIds(new Set());
    }
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

  const handleSelectAll = (checked, rowIds) => {
    const ids = Array.isArray(rowIds) ? rowIds : filteredRows.map((r) => r.id);
    setSelectedIds((prev) => {
      if (checked) {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      }
      const remove = new Set(ids);
      const next = new Set();
      prev.forEach((id) => {
        if (!remove.has(id)) next.add(id);
      });
      return next;
    });
  };

  const startMasquerade = async (targetUserId) => {
    const id = auth.coerceTargetUserId(targetUserId);
    if (!id) {
      setAlertModal({
        isOpen: true,
        title: 'Masquerade failed',
        message: 'Could not start masquerade session',
        variant: 'error',
      });
      return;
    }
    setMasqueradeBusyId(id);
    try {
      const res = await adminUsersAPI.masqueradeStart(id);
      if (!res?.token || !res?.user) throw new Error('Invalid masquerade response');
      if (!auth.enterMasquerade(res.token, res.user)) {
        throw new Error('Could not start masquerade session');
      }
      window.location.replace(withDemoPath('/dashboard'));
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

  const setColumnWidth = (key, width) => {
    setColumns((prev) => prev.map((c) => {
      if (c.key !== key) return c;
      const nextWidth = clampTableColumnWidth(width, { min: minWidthForColumnKey(key) });
      return nextWidth == null ? c : { ...c, width: nextWidth };
    }));
  };

  const resetColumnWidth = (key) => {
    setColumns((prev) => prev.map((c) => {
      if (c.key !== key) return c;
      const def = defaultColumns.find((d) => d.key === c.key);
      if (def?.width == null) {
        const next = { ...c };
        delete next.width;
        return next;
      }
      return { ...c, width: def.width };
    }));
  };

  const resetColumnWidths = () => {
    setColumns((prev) => prev.map((c) => {
      const def = defaultColumns.find((d) => d.key === c.key);
      if (def?.width == null) {
        const next = { ...c };
        delete next.width;
        return next;
      }
      return { ...c, width: def.width };
    }));
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
    <div className="flex flex-col bg-[#f8f9fb]">
      <div className="h-screen h-dvh flex flex-col overflow-hidden">
        <div className="shrink-0">
          <AppHeader user={user} onLogout={onLogout} activePage="users" emailVariant="crm" />
        </div>

        <main className="flex-1 flex flex-col min-h-0 w-full px-4 sm:px-6 lg:px-8 pt-5 pb-24 lg:pb-2">
          <div className="shrink-0">
            <UsersHeader
              onCreateUser={() => setCreateModalOpen(true)}
              onInviteUser={() => setInviteModalOpen(true)}
              onExport={() => handleExport(selectedUsers.length ? selectedUsers : filteredRows)}
              onRefresh={loadUsers}
              onClearFilters={clearAllFilters}
            />

            <UsersKpiCards
            kpis={kpis}
            loading={loading && list.length === 0 && !loadError}
            activeTab={activeTab}
            onCardClick={handleKpiClick}
          />

            <UsersSegmentedTabs activeTab={activeTab} tabCounts={tabCounts} onChange={(tab) => { setActiveTab(tab); setActiveViewId('all'); }} />

            <UsersFilters
              searchQ={searchQ}
              onSearchChange={setSearchQ}
              filters={filters}
              onFiltersChange={setFilters}
              onClear={clearAllFilters}
              columns={columns}
              onMoveColumn={moveColumn}
              onToggleColumn={toggleColumnVisible}
              onColumnWidthChange={setColumnWidth}
              onResetColumnWidths={resetColumnWidths}
              draggingColumnKey={draggingColumnKey}
              setDraggingColumnKey={setDraggingColumnKey}
              activeViewId={activeViewId}
              onSelectView={handleSelectView}
              activeTab={activeTab}
            />
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
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
              onSendSms={(u, message) => setSmsTarget({ user: u, message: message || u?.verification?.suggested_sms?.next_gap || '' })}
              onViewDocument={(doc) => setLicenseCard(presentLicenseCard(doc))}
              onResetPassword={handleResetPassword}
              onDelete={(u) => setDeleteTarget(u)}
              onPlaceholderAction={setPlaceholderAction}
              masqueradeBusyId={masqueradeBusyId}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onColumnWidthChange={setColumnWidth}
              onResetColumnWidth={resetColumnWidth}
            />
          </div>
        </main>
      </div>

      <AppFooter />

      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onExport={() => handleExport(selectedUsers)}
        onSendEmail={() => setEmailModalUsers(selectedUsers)}
        onSendSms={() => {
          if (selectedUsers.length !== 1) {
            setAlertModal({
              isOpen: true,
              title: 'Send SMS',
              message: 'Select a single user to send SMS.',
              variant: 'error',
            });
            return;
          }
          const u = selectedUsers[0];
          setSmsTarget({ user: u, message: u.verification?.suggested_sms?.next_gap || '' });
        }}
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
          onSendSms={(u, message) => setSmsTarget({ user: u, message: message || u?.verification?.suggested_sms?.next_gap || '' })}
          onViewDocument={(doc) => setLicenseCard(presentLicenseCard(doc))}
          onMasquerade={startMasquerade}
          onResetPassword={handleResetPassword}
          onDelete={(u) => setDeleteTarget(u)}
          onPlaceholderAction={setPlaceholderAction}
          masqueradeBusyId={masqueradeBusyId}
          onProfileSaved={() => loadUsers()}
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

      <SendUserSmsModal
        isOpen={!!smsTarget}
        user={smsTarget?.user}
        suggestedMessage={smsTarget?.message || ''}
        onClose={() => setSmsTarget(null)}
        onSuccess={(msg) => setAlertModal({ isOpen: true, title: 'SMS sent', message: msg, variant: 'success' })}
        onError={(msg) => setAlertModal({ isOpen: true, title: 'SMS failed', message: msg, variant: 'error' })}
      />

      <LicenseDocumentModal
        isOpen={!!licenseCard}
        card={licenseCard}
        onClose={() => setLicenseCard(null)}
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
