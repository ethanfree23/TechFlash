import React from 'react';
import SettingsBadge from './SettingsBadge';

export default function SettingsHeader({
  title = 'Settings',
  subtitle,
  roleBadge,
  statusBadges = [],
  lastSavedAt,
  note,
}) {
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm sm:text-base text-gray-600 max-w-3xl leading-relaxed">{subtitle}</p>}
          {note && <p className="mt-2 text-xs text-gray-500">{note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {roleBadge && <SettingsBadge variant="role">{roleBadge}</SettingsBadge>}
          {statusBadges.map((b) => (
            <SettingsBadge key={b} variant="status">
              {b}
            </SettingsBadge>
          ))}
        </div>
      </div>
      {lastSavedAt && (
        <p className="mt-3 text-xs text-gray-500">
          Last account sync:{' '}
          <time dateTime={lastSavedAt}>{new Date(lastSavedAt).toLocaleString()}</time>
        </p>
      )}
    </header>
  );
}
