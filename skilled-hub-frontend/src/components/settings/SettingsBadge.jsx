import React from 'react';

const variants = {
  role: 'bg-blue-50 text-blue-800 border-blue-200',
  status: 'bg-gray-50 text-gray-800 border-gray-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  muted: 'bg-slate-50 text-slate-600 border-slate-200',
  orange: 'bg-orange-50 text-orange-900 border-orange-200',
};

export default function SettingsBadge({ children, variant = 'muted', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${variants[variant] || variants.muted} ${className}`}
    >
      {children}
    </span>
  );
}
