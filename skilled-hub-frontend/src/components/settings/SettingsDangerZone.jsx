import React from 'react';

export default function SettingsDangerZone({ title = 'Danger zone', description, children }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 sm:p-5">
      <p className="text-sm font-semibold text-red-900">{title}</p>
      {description && <p className="text-sm text-red-800/90 mt-1">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
