import React from 'react';
import { CRM_SOCIAL_TYPES } from '../../utils/crmCompanySocials';

export default function CrmCompanySocialRows({ rows, onChange, disabled = false }) {
  const usedTypes = new Set((rows || []).map((r) => r.type));
  const availableToAdd = CRM_SOCIAL_TYPES.filter((t) => !usedTypes.has(t.id));

  const updateRow = (index, patch) => {
    const next = (rows || []).map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const removeRow = (index) => {
    onChange((rows || []).filter((_, i) => i !== index));
  };

  const addRow = () => {
    const type = availableToAdd[0]?.id;
    if (!type) return;
    onChange([...(rows || []), { type, url: '' }]);
  };

  return (
        <div className="space-y-2">
      <span className="text-xs font-medium text-gray-500 uppercase">Company socials</span>
      {(rows || []).map((row, index) => {
        const typeDef = CRM_SOCIAL_TYPES.find((t) => t.id === row.type) || CRM_SOCIAL_TYPES[0];
        return (
          <div key={`social-${index}`} className="flex flex-wrap gap-2 items-end">
            <label className="block min-w-[120px]">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Network</span>
              <select
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white disabled:bg-gray-100"
                value={row.type}
                disabled={disabled}
                onChange={(e) => updateRow(index, { type: e.target.value })}
              >
                {CRM_SOCIAL_TYPES.map((t) => (
                  <option key={t.id} value={t.id} disabled={usedTypes.has(t.id) && t.id !== row.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1 min-w-[200px]">
              <span className="text-[10px] font-medium text-gray-500 uppercase">URL</span>
              <input
                className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100"
                value={row.url || ''}
                disabled={disabled}
                placeholder={`${typeDef.label} URL`}
                onChange={(e) => updateRow(index, { url: e.target.value })}
              />
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(index)}
              className="px-2 py-1.5 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        );
      })}
      <button
        type="button"
        disabled={disabled || availableToAdd.length === 0}
        onClick={addRow}
        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        + Add company social
      </button>
    </div>
  );
}
