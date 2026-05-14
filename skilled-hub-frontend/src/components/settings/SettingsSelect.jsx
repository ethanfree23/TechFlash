import React from 'react';

const base =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50';

export default function SettingsSelect({ className = '', children, ...rest }) {
  return (
    <select className={`${base} ${className}`} {...rest}>
      {children}
    </select>
  );
}
