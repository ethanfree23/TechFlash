import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminMembershipTierConfigsAPI } from '../../api/api';
import { buildTierUpdatePayload, defaultAdditionalFeatures, rowFromTier } from './adminJobAccessSettingsState';

export default function AdminJobAccessSettings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeFeatureTierId, setActiveFeatureTierId] = useState(null);

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

  const updateAdditionalFeature = (id, key, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          additionalFeatures: {
            ...defaultAdditionalFeatures(),
            ...row.additionalFeatures,
            [key]: value,
          },
        };
      })
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const row of rows) {
        await adminMembershipTierConfigsAPI.update(row.id, buildTierUpdatePayload(row));
      }
      await load();
    } catch (e) {
      setError(e.message || 'Failed to save job access settings');
    } finally {
      setSaving(false);
    }
  };

  const activeFeatureTier = useMemo(
    () => rows.find((row) => row.id === activeFeatureTierId) || null,
    [rows, activeFeatureTierId]
  );

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 space-y-2">
        <p>
          Control job visibility by technician tier. A tier can see jobs starting{' '}
          <span className="font-medium text-gray-900">X hours after</span> the job&apos;s go-live date.
        </p>
        <p>
          Configure extra early-access eligibility rules with the additional features popup. Jobs still enforce each
          listing&apos;s own minimum years requirement.
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
                  <th className="px-3 py-2 font-medium">Access after live (hours)</th>
                  <th className="px-3 py-2 font-medium">Additional features</th>
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
                        value={row.accessAfterLiveHours}
                        onChange={(e) => updateRow(row.id, { accessAfterLiveHours: e.target.value })}
                        className="w-28 border rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setActiveFeatureTierId(row.id)}
                        className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Additional features
                      </button>
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

      {activeFeatureTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Additional features for {activeFeatureTier.displayName}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Configure additional access conditions for this tier.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-gray-700 space-y-1">
                <span>Minimum years experience</span>
                <input
                  type="number"
                  min="0"
                  value={activeFeatureTier.additionalFeatures?.minimumExperienceYears ?? '0'}
                  onChange={(e) =>
                    updateAdditionalFeature(activeFeatureTier.id, 'minimumExperienceYears', e.target.value)
                  }
                  className="w-full border rounded px-2 py-1.5"
                />
              </label>
              <label className="text-sm text-gray-700 space-y-1">
                <span>Minimum jobs completed on platform</span>
                <input
                  type="number"
                  min="0"
                  value={activeFeatureTier.additionalFeatures?.minimumJobsCompleted ?? '0'}
                  onChange={(e) => updateAdditionalFeature(activeFeatureTier.id, 'minimumJobsCompleted', e.target.value)}
                  className="w-full border rounded px-2 py-1.5"
                />
              </label>
              <label className="text-sm text-gray-700 space-y-1">
                <span>Minimum successful jobs</span>
                <input
                  type="number"
                  min="0"
                  value={activeFeatureTier.additionalFeatures?.minimumSuccessfulJobs ?? '0'}
                  onChange={(e) => updateAdditionalFeature(activeFeatureTier.id, 'minimumSuccessfulJobs', e.target.value)}
                  className="w-full border rounded px-2 py-1.5"
                />
              </label>
              <label className="text-sm text-gray-700 space-y-1">
                <span>Minimum profile completeness (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeFeatureTier.additionalFeatures?.minimumProfileCompletenessPercent ?? '0'}
                  onChange={(e) =>
                    updateAdditionalFeature(activeFeatureTier.id, 'minimumProfileCompletenessPercent', e.target.value)
                  }
                  className="w-full border rounded px-2 py-1.5"
                />
              </label>
              <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(activeFeatureTier.additionalFeatures?.requiresVerifiedBackground)}
                  onChange={(e) =>
                    updateAdditionalFeature(activeFeatureTier.id, 'requiresVerifiedBackground', e.target.checked)
                  }
                />
                Require verified background check
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveFeatureTierId(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
