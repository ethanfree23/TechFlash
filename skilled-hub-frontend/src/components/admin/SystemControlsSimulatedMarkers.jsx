import React, { useState, useEffect, useCallback } from 'react';
import { adminSimulatedMarkersAPI } from '../../api/api';
import AlertModal from '../AlertModal';

export default function SystemControlsSimulatedMarkers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: '',
    latitude: '',
    longitude: '',
    trade_label: '',
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminSimulatedMarkersAPI.list();
      setRows(Array.isArray(res?.simulated_technician_markers) ? res.simulated_technician_markers : []);
    } catch (e) {
      setError(e.message || 'Failed to load markers');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await adminSimulatedMarkersAPI.create({
        name: form.name.trim(),
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        trade_label: form.trade_label.trim() || null,
        active: form.active,
      });
      setForm({ name: '', latitude: '', longitude: '', trade_label: '', active: true });
      setAlertModal({ isOpen: true, title: 'Saved', message: 'Simulated marker created.', variant: 'success' });
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Create failed', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      await adminSimulatedMarkersAPI.update(row.id, { active: !row.active });
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Update failed', variant: 'error' });
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete marker "${row.name}"?`)) return;
    try {
      await adminSimulatedMarkersAPI.remove(row.id);
      setAlertModal({ isOpen: true, title: 'Deleted', message: 'Marker removed.', variant: 'success' });
      await load();
    } catch (e) {
      setAlertModal({ isOpen: true, title: 'Error', message: e.message || 'Delete failed', variant: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 max-w-3xl">
        <span className="font-medium text-gray-800">Where to find this:</span> Settings → System controls → Map markers
        (this page). Fake technician pins appear on the map for techs and companies (privacy-preserving network density).
        Admins see these in turquoise on the map.
      </p>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Demo Tech NW"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={form.latitude}
            onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
            placeholder="29.76"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={form.longitude}
            onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
            placeholder="-95.37"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Trade label</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={form.trade_label}
            onChange={(e) => setForm((f) => ({ ...f, trade_label: e.target.value }))}
            placeholder="HVAC"
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={handleCreate}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Lat / Lng</th>
              <th className="px-3 py-2">Trade</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.latitude}, {r.longitude}
                </td>
                <td className="px-3 py-2">{r.trade_label || '—'}</td>
                <td className="px-3 py-2">{r.active ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2 space-x-2">
                  <button type="button" className="text-blue-600 hover:underline" onClick={() => toggleActive(r)}>
                    {r.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => remove(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading && <p className="p-4 text-gray-500 text-sm">No simulated markers.</p>}
      </div>

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
