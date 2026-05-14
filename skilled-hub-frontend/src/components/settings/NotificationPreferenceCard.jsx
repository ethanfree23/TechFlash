import React from 'react';
import SettingsBadge from './SettingsBadge';
import SettingsToggle from './SettingsToggle';
import { channelSummaryForItem, frequencySummaryForItem, isCategoryEnabled } from '../../utils/notificationPreferenceAdapter';

function Icon({ name }) {
  const cls = 'h-5 w-5';
  switch (name) {
    case 'bell':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
    case 'mail':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case 'currency':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'megaphone':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.429L5 14m0 0l2.447-2.447M5 14l2.447 2.447" />
        </svg>
      );
    case 'users':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case 'chart':
    default:
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
  }
}

function Chip({ label, tone }) {
  const tones = {
    on: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    off: 'bg-gray-50 text-gray-600 border-gray-200',
    soon: 'bg-amber-50 text-amber-900 border-amber-200',
    preview: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tones[tone] || tones.off}`}>
      {label}
    </span>
  );
}

export default function NotificationPreferenceCard({
  item,
  notificationPrefs,
  jobAlertForm,
  isTechnician,
  savingNotifications,
  savingJobAlertForm,
  onTogglePersisted,
  onCustomize,
}) {
  const ch = channelSummaryForItem(item, notificationPrefs, jobAlertForm, { isTechnician });
  const freq = frequencySummaryForItem(item);
  const enabled = isCategoryEnabled(item, notificationPrefs);
  const disabledToggle =
    item.persistence === 'local_only' || savingNotifications || savingJobAlertForm;

  const chipTone = (v) => {
    if (v === 'on') return 'on';
    if (v === 'off') return 'off';
    return 'soon';
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3 min-w-0">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
            <Icon name={item.icon} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
              {item.persistence === 'local_only' && (
                <SettingsBadge variant="warning">Preview</SettingsBadge>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip label={`Email: ${ch.email === 'on' ? 'On' : ch.email === 'preview' ? 'Preview' : 'Off'}`} tone={chipTone(ch.email === 'preview' ? 'preview' : ch.email)} />
              <Chip label={`SMS: ${ch.sms === 'soon' ? 'Soon' : ch.sms === 'on' ? 'On' : 'Off'}`} tone={ch.sms === 'soon' ? 'soon' : chipTone(ch.sms)} />
              <Chip label={`Push: Soon`} tone="soon" />
              <Chip label={`In-app: ${ch.inApp === 'soon' ? 'Soon' : ch.inApp === 'on' ? 'On' : 'Off'}`} tone={ch.inApp === 'soon' ? 'soon' : chipTone(ch.inApp)} />
            </div>
            <p className="mt-2 text-xs text-gray-500">{freq}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-row sm:flex-col items-center justify-between sm:items-end gap-3 border-t border-gray-100 pt-3 sm:border-0 sm:pt-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600">Enabled</span>
            <SettingsToggle
              checked={item.persistence === 'local_only' ? false : enabled}
              disabled={disabledToggle || savingNotifications || savingJobAlertForm}
              onChange={(v) => onTogglePersisted(item, v)}
              ariaLabel={`Toggle ${item.title}`}
            />
          </div>
          <button
            type="button"
            onClick={() => onCustomize(item)}
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            Customize
          </button>
        </div>
      </div>
    </div>
  );
}
