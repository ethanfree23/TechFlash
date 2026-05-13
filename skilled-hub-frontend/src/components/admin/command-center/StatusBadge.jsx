import React from 'react';

const styles = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  orange: 'bg-orange-50 text-[#c2410c] border-orange-200',
};

export default function StatusBadge({ children, variant = 'default' }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}
