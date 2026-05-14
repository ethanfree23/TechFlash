import React from 'react';
import SettingsBadge from './SettingsBadge';

export default function AdminBackendPlaceholder({ title, description, suggestedModel }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/90 p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <SettingsBadge variant="warning">Backend needed</SettingsBadge>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
      {suggestedModel && (
        <p className="mt-3 text-xs font-mono text-gray-500 bg-white/80 border border-gray-200 rounded-lg px-3 py-2">
          {suggestedModel}
        </p>
      )}
      <p className="mt-4 text-xs text-gray-500">
        Not connected to backend yet. Add persistence before enabling in production.
      </p>
    </div>
  );
}
