import React from 'react';

export default function SettingsRow({
  icon,
  title,
  description,
  control,
  badge,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-4 border-b border-gray-100 last:border-0 ${className}`}
    >
      <div className="flex gap-3 min-w-0 flex-1">
        {icon && (
          <div className="shrink-0 mt-0.5 h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {title && <p className="text-sm font-medium text-gray-900">{title}</p>}
            {badge}
          </div>
          {description && <p className="text-sm text-gray-600 mt-0.5 max-w-xl">{description}</p>}
        </div>
      </div>
      {control && <div className="shrink-0 sm:pl-4 w-full sm:w-auto flex sm:justify-end">{control}</div>}
    </div>
  );
}
