import React from 'react';

export default function AdminControlPanel({ title, description, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {(title || description) && (
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50/80 to-blue-50/30">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {description && <p className="text-sm text-gray-600 mt-1 max-w-3xl">{description}</p>}
        </div>
      )}
      <div className="px-4 sm:px-5 py-4">{children}</div>
    </div>
  );
}
