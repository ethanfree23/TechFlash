import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { adminUsersAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import AdminCreateUserModal from '../components/AdminCreateUserModal';
import { auth } from '../auth';
import { FaEye, FaSearch, FaUserPlus } from 'react-icons/fa';

const ROLE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'company', label: 'Companies' },
  { id: 'technician', label: 'Technicians' },
];

export default function AdminUsersPage({ user, onLogout }) {
  const navigate = useNavigate();
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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="users" emailVariant="crm" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse technicians and companies, or open analytics for any account.
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
          onCompleted={async ({ kind }) => {
            await loadUsers();
            const messages = {
              company_link:
                'Company contact login created and linked to the selected company account. They were emailed a secure password setup link.',
              company_new:
                'Company user created. A CRM record was added as Prospect until they post their first job (then it becomes Customer). They were emailed “Welcome aboard” with a link to set a secure password.',
              technician:
                'They receive an email with a link to set their password. Until then they can sign in using their email-derived temporary password.',
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

        <div className="bg-white rounded-2xl border border-gray-100 shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Label</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                      No users match.
                    </td>
                  </tr>
                ) : (
                  list.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50/80 cursor-pointer"
                      onClick={() => navigate(`/admin/users/${row.id}`)}
                    >
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{row.email}</div>
                        <div className="text-xs text-gray-500">#{row.id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm capitalize text-gray-700">{row.role}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.label}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            to={`/admin/users/${row.id}`}
                            onClick={(e) => e.stopPropagation()}
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
