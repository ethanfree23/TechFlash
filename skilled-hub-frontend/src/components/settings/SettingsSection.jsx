import React from 'react';

export default function SettingsSection({ title, description, action, children, className = '' }) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
          {description && <p className="text-sm text-gray-600 mt-0.5 max-w-2xl">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
