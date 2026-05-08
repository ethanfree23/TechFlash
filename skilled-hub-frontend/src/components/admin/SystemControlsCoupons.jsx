import React, { useState, useEffect, useCallback } from 'react';
import { adminCouponsAPI } from '../../api/api';
import AlertModal from '../AlertModal';

function formatRemaining(sec) {
  if (sec == null || sec === '') return '—';
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return 'Expired';
  const d = Math.floor(n / 86400);
  const h = Math.floor((n % 86400) / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const emptyForm = () => ({
  name: '',
  code: '',
  discount_kind: 'percent',
  discount_value: '10',
  active: true,
  starts_at: '',
  ends_at: '',
  duration_template: 'fixed_window',
  duration_days: '',
});

export default function SystemControlsCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCouponsAPI.list();
      const list = res?.coupons || [];
      setCoupons(list);
      setSelectedId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setError(e.message || 'Failed to load coupons');
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = coupons.find((c) => c.id === selectedId) || null;

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '',
      code: c.code || '',
      discount_kind: c.discount_kind || 'percent',
      discount_value: String(c.discount_value ?? ''),
      active: c.active !== false,
      starts_at: c.starts_at ? c.starts_at.slice(0, 16) : '',
      ends_at: c.ends_at ? c.ends_at.slice(0, 16) : '',
      duration_template: c.duration_template || 'fixed_window',
      duration_days: c.duration_days != null ? String(c.duration_days) : '',
    });
  };

  const payloadFromForm = () => {
    const p = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      discount_kind: form.discount_kind,
      discount_value: parseInt(form.discount_value, 10) || 0,
      active: form.active,
      duration_template: form.duration_template,
    };
    if (form.starts_at) p.starts_at = new Date(form.starts_at).toISOString();
    if (form.ends_at) p.ends_at = new Date(form.ends_at).toISOString();
    if (form.duration_template === 'custom_days' && form.duration_days) {
      p.duration_days = parseInt(form.duration_days, 10);
    }
    return p;
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await adminCouponsAPI.create(payloadFromForm());
      setForm(emptyForm());
      setAlertModal({ isOpen: true, title: 'Created', message: 'Coupon saved.', variant: 'success' });
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Create failed', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await adminCouponsAPI.update(editingId, payloadFromForm());
      setEditingId(null);
      setForm(emptyForm());
      setAlertModal({ isOpen: true, title: 'Saved', message: 'Coupon updated.', variant: 'success' });
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Update failed', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await adminCouponsAPI.remove(deleteTarget.id);
      setDeleteTarget(null);
      setSelectedId(null);
      setAlertModal({ isOpen: true, title: 'Deleted', message: 'Coupon removed.', variant: 'success' });
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Delete failed', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    const uid = parseInt(assignUserId, 10);
    if (!selected || !Number.isFinite(uid)) {
      setAlertModal({ isOpen: true, title: 'Invalid', message: 'Enter a valid user ID.', variant: 'error' });
      return;
    }
    setAssignBusy(true);
    try {
      await adminCouponsAPI.assignToUser({
        coupon_id: selected.id,
        user_id: uid,
        status: 'active',
      });
      setAssignUserId('');
      setAlertModal({ isOpen: true, title: 'Assigned', message: 'Coupon assigned to user.', variant: 'success' });
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Assign failed', variant: 'error' });
    } finally {
      setAssignBusy(false);
    }
  };

  const patchAssignment = async (assignmentId, attrs) => {
    try {
      await adminCouponsAPI.updateAssignment(assignmentId, attrs);
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Update failed', variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 max-w-3xl">
        Create promo codes and assign them to users. Active assignments adjust membership fee and commission via the API
        billing policy.
      </p>

      {loading && <p className="text-sm text-gray-500">Loading coupons…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="font-semibold text-gray-900">Coupons</h3>
          <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto text-sm">
            {coupons.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left py-2 px-2 rounded ${selectedId === c.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}`}
                >
                  <span className="font-medium">{c.code}</span>
                  <span className="text-gray-500"> — {c.name}</span>
                  {!c.active && <span className="ml-2 text-xs text-amber-700">inactive</span>}
                </button>
              </li>
            ))}
            {!coupons.length && !loading && <li className="text-gray-500 py-2">No coupons yet.</li>}
          </ul>

          <div className="border-t border-gray-100 pt-3 space-y-2">
            <h4 className="text-sm font-medium text-gray-800">New coupon</h4>
            {!editingId && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="border rounded px-2 py-1.5 text-sm"
                    placeholder="Name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <input
                    className="border rounded px-2 py-1.5 text-sm uppercase"
                    placeholder="CODE"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    className="border rounded px-2 py-1.5 text-sm"
                    value={form.discount_kind}
                    onChange={(e) => setForm((f) => ({ ...f, discount_kind: e.target.value }))}
                  >
                    <option value="percent">Percent off</option>
                    <option value="fixed_cents">Fixed cents off fee</option>
                  </select>
                  <input
                    className="border rounded px-2 py-1.5 text-sm w-24"
                    type="number"
                    min="0"
                    value={form.discount_value}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
                  />
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    className="border rounded px-2 py-1.5 text-sm"
                    value={form.starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  />
                  <input
                    type="datetime-local"
                    className="border rounded px-2 py-1.5 text-sm"
                    value={form.ends_at}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  />
                </div>
                <select
                  className="border rounded px-2 py-1.5 text-sm w-full"
                  value={form.duration_template}
                  onChange={(e) => setForm((f) => ({ ...f, duration_template: e.target.value }))}
                >
                  <option value="fixed_window">Fixed window (starts / ends)</option>
                  <option value="one_month">1 month from activation</option>
                  <option value="three_months">3 months from activation</option>
                  <option value="custom_days">Custom days from activation</option>
                </select>
                {form.duration_template === 'custom_days' && (
                  <input
                    type="number"
                    min="1"
                    className="border rounded px-2 py-1.5 text-sm w-full"
                    placeholder="Duration days"
                    value={form.duration_days}
                    onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))}
                  />
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Create coupon
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Coupon profile</h3>
          {!selected && <p className="text-sm text-gray-500">Select a coupon.</p>}
          {selected && (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="text-sm text-blue-700 hover:underline" onClick={() => openEdit(selected)}>
                  Edit details
                </button>
                <button type="button" className="text-sm text-red-700 hover:underline" onClick={() => setDeleteTarget(selected)}>
                  Delete
                </button>
              </div>

              {editingId === selected.id ? (
                <div className="space-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <input
                    className="border rounded px-2 py-1.5 text-sm w-full"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <input
                    className="border rounded px-2 py-1.5 text-sm w-full uppercase"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="border rounded px-2 py-1.5 text-sm"
                      value={form.discount_kind}
                      onChange={(e) => setForm((f) => ({ ...f, discount_kind: e.target.value }))}
                    >
                      <option value="percent">Percent</option>
                      <option value="fixed_cents">Fixed cents</option>
                    </select>
                    <input
                      type="number"
                      className="border rounded px-2 py-1.5 text-sm w-28"
                      value={form.discount_value}
                      onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
                    />
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                      />
                      Active
                    </label>
                  </div>
                  <select
                    className="border rounded px-2 py-1.5 text-sm w-full"
                    value={form.duration_template}
                    onChange={(e) => setForm((f) => ({ ...f, duration_template: e.target.value }))}
                  >
                    <option value="fixed_window">Fixed window</option>
                    <option value="one_month">1 month from activation</option>
                    <option value="three_months">3 months from activation</option>
                    <option value="custom_days">Custom days</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="datetime-local"
                      className="border rounded px-2 py-1.5 text-sm"
                      value={form.starts_at}
                      onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                    />
                    <input
                      type="datetime-local"
                      className="border rounded px-2 py-1.5 text-sm"
                      value={form.ends_at}
                      onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                    />
                  </div>
                  {form.duration_template === 'custom_days' && (
                    <input
                      type="number"
                      className="border rounded px-2 py-1.5 text-sm"
                      value={form.duration_days}
                      onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveEdit}
                      className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setForm(emptyForm());
                      }}
                      className="px-3 py-1.5 rounded border text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-gray-500">Code</dt>
                  <dd className="font-mono">{selected.code}</dd>
                  <dt className="text-gray-500">Discount</dt>
                  <dd>
                    {selected.discount_kind === 'percent'
                      ? `${selected.discount_value}%`
                      : `${(selected.discount_value / 100).toFixed(2)} USD`}
                  </dd>
                  <dt className="text-gray-500">Template</dt>
                  <dd>{selected.duration_template}</dd>
                </dl>
              )}

              <div className="border-t border-gray-100 pt-3">
                <h4 className="text-sm font-medium mb-2">Assign to user</h4>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="number"
                    className="border rounded px-2 py-1.5 text-sm w-36"
                    placeholder="User ID"
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={assignBusy}
                    onClick={handleAssign}
                    className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Assignments</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-1 pr-2">User</th>
                        <th className="py-1 pr-2">Status</th>
                        <th className="py-1 pr-2">Remaining</th>
                        <th className="py-1 pr-2">Auto-renew</th>
                        <th className="py-1 pr-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.assignments || []).map((a) => (
                        <tr key={a.id} className="border-b border-gray-50">
                          <td className="py-1 pr-2">
                            #{a.user_id}
                            <span className="text-gray-500 block truncate max-w-[140px]">{a.user_email}</span>
                          </td>
                          <td className="py-1 pr-2">{a.status}</td>
                          <td className="py-1 pr-2">{formatRemaining(a.remaining_seconds)}</td>
                          <td className="py-1 pr-2">
                            <input
                              type="checkbox"
                              checked={!!a.auto_renew}
                              onChange={(e) => patchAssignment(a.id, { auto_renew: e.target.checked })}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              onClick={() =>
                                patchAssignment(a.id, { status: a.status === 'active' ? 'cancelled' : 'active' })
                              }
                            >
                              {a.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!(selected.assignments || []).length && (
                    <p className="text-sm text-gray-500 py-2">No assignments yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <p className="text-gray-900 font-medium">Delete coupon {deleteTarget.code}?</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded border" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-red-600 text-white"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
