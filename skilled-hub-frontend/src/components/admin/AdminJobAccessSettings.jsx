import React, { useCallback, useEffect, useState } from 'react';
import { adminMembershipTierConfigsAPI } from '../../api/api';

function rowFromTier(tier) {
  return {
    id: tier.id,
    slug: tier.slug,
    displayName: tier.display_name || tier.slug,
    earlyAccessDelayHours: String(tier.early_access_delay_hours ?? 0),
    minimumExperienceYears: String(tier.job_access_min_experience_years ?? 0),
    sortOrder: tier.sort_order ?? 0,
  };
}

export default function AdminJobAccessSettings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminMembershipTierConfigsAPI.list('technician');
      const list = (res?.membership_tier_configs || []).slice().sort((a, b) => {
        if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        return (a.id ?? 0) - (b.id ?? 0);
      });
      setRows(list.map(rowFromTier));
    } catch (e) {
      setError(e.message || 'Failed to load tier access settings');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const row of rows) {
        const earlyAccessDelayHours = parseInt(row.earlyAccessDelayHours, 10);
        const minimumExperienceYears = parseInt(row.minimumExperienceYears, 10);
        await adminMembershipTierConfigsAPI.update(row.id, {
          early_access_delay_hours: Number.isNaN(earlyAccessDelayHours) ? 0 : Math.max(0, earlyAccessDelayHours),
          job_access_min_experience_years: Number.isNaN(minimumExperienceYears) ? 0 : Math.max(0, minimumExperienceYears),
        });
      }
      await load();
    } catch (e) {
      setError(e.message || 'Failed to save job access settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 space-y-2">
        <p>
          Control job visibility by technician tier. A tier can see jobs starting{' '}
          <span className="font-medium text-gray-900">X hours before</span> the job&apos;s go-live date.
        </p>
        <p>
          You can also require a minimum experience level by tier. Jobs still enforce each listing&apos;s own minimum
          years requirement.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">Access before go-live (hours)</th>
                  <th className="px-3 py-2 font-medium">Min experience years for this tier</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{row.displayName}</div>
                      <div className="text-xs text-gray-500 font-mono">{row.slug}</div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={row.earlyAccessDelayHours}
                        onChange={(e) => updateRow(row.id, { earlyAccessDelayHours: e.target.value })}
                        className="w-28 border rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={row.minimumExperienceYears}
                        onChange={(e) => updateRow(row.id, { minimumExperienceYears: e.target.value })}
                        className="w-28 border rounded px-2 py-1 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save access settings'}
          </button>
        </div>
      )}
    </div>
  );
}
