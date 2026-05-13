import React from 'react';

const styles = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  neutral: 'bg-white text-slate-600 border-slate-300',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-slate-50 text-slate-700 border-slate-200',
  orange: 'bg-orange-50 text-orange-900 border-orange-200',
};

export default function StatusBadge({ children, variant = 'default' }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${styles[variant] || styles.default}`}
    >
      {children}
    </span>
  );
}
