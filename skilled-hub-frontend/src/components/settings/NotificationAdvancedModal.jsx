import React, { useEffect, useState, useCallback } from 'react';
import Modal from 'react-modal';
import SettingsToggle from './SettingsToggle';
import SettingsSelect from './SettingsSelect';
import SettingsBadge from './SettingsBadge';

const defaultLocalAdvanced = () => ({
  frequency: 'immediate',
  respectQuietHours: true,
  bypassQuietForUrgent: false,
  urgency: 'normal',
  quietStart: '22:00',
  quietEnd: '07:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
  language: 'en',
  // TODO(backend): persist per-category advanced notification preferences
});

export default function NotificationAdvancedModal({
  isOpen,
  item,
  onClose,
  notificationPrefs,
  onPersistNotificationPrefs,
  isTechnician,
  jobAlertModalBody,
  onSaveJobAlerts,
  savingJobAlertForm,
  savingNotifications,
  localAdvancedById,
  onUpdateLocalAdvanced,
}) {
  const [draft, setDraft] = useState(null);
  const [local, setLocal] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) return;
    setDraft({
      email_notifications_enabled: notificationPrefs.email_notifications_enabled,
      job_alert_notifications_enabled: notificationPrefs.job_alert_notifications_enabled,
      email_notification_preferences: { ...notificationPrefs.email_notification_preferences },
    });
    setLocal(
      item.persistence === 'local_only'
        ? { ...defaultLocalAdvanced(), ...(localAdvancedById?.[item.id] || {}) }
        : null
    );
    setDirty(false);
  }, [isOpen, item, notificationPrefs, localAdvancedById]);

  const markDirty = useCallback(() => setDirty(true), []);

  const handleClose = () => {
    if (dirty && item?.persistence === 'local_only') {
      const ok = window.confirm('Discard unsaved preview changes for this notification?');
      if (!ok) return;
    }
    onClose();
  };

  const handleReset = () => {
    if (!item) return;
    if (item.persistence === 'user_email_category') {
      setDraft({
        email_notifications_enabled: true,
        job_alert_notifications_enabled: notificationPrefs.job_alert_notifications_enabled,
        email_notification_preferences: {
          ...notificationPrefs.email_notification_preferences,
          [item.emailCategory]: true,
        },
      });
    } else if (item.persistence === 'local_only') {
      setLocal(defaultLocalAdvanced());
    }
    markDirty();
  };

  const handleSave = async () => {
    if (!item) return;
    if (item.persistence === 'user_email_category' && draft) {
      await onPersistNotificationPrefs(draft);
      setDirty(false);
      onClose();
      return;
    }
    if (item.persistence === 'local_only' && local) {
      onUpdateLocalAdvanced(item.id, local);
      setDirty(false);
      onClose();
      return;
    }
    if (item.id === 'new_job_alerts' && isTechnician) {
      await onSaveJobAlerts();
      onClose();
    }
  };

  if (!item) return null;

  const title = `${item.title} — advanced`;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      contentLabel={title}
      className="relative mx-auto my-6 w-[calc(100%-1.5rem)] max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl outline-none"
      overlayClassName="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px] flex items-start justify-center overflow-y-auto py-6"
    >
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">{item.description}</p>
            {item.persistence === 'local_only' && (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
                Preview only — not saved to your account yet. TODO(backend): add API for advanced preferences.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-5">
              {item.persistence === 'user_email_category' && draft && (
                <>
                  <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email for this category</p>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-800">All non-critical emails (master)</span>
                      <SettingsToggle
                        checked={draft.email_notifications_enabled !== false}
                        disabled={savingNotifications}
                        onChange={(v) => {
                          setDraft((d) => ({ ...d, email_notifications_enabled: v }));
                          markDirty();
                        }}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-800">This category</span>
                      <SettingsToggle
                        checked={draft.email_notification_preferences[item.emailCategory] !== false}
                        disabled={savingNotifications || draft.email_notifications_enabled === false}
                        onChange={(v) => {
                          setDraft((d) => ({
                            ...d,
                            email_notification_preferences: {
                              ...d.email_notification_preferences,
                              [item.emailCategory]: v,
                            },
                          }));
                          markDirty();
                        }}
                      />
                    </label>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3 opacity-60">
                    <p className="text-xs font-semibold text-gray-500">SMS, push, in-app</p>
                    <p className="text-sm text-gray-600">Coming soon for this category. Job alert SMS/in-app still applies only to new job alerts.</p>
                  </div>
                </>
              )}

              {item.id === 'new_job_alerts' && isTechnician && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">New job alerts (master)</p>
                      <p className="text-xs text-gray-600 mt-0.5">Turn off to stop job alert notifications.</p>
                    </div>
                    <SettingsToggle
                      checked={notificationPrefs.job_alert_notifications_enabled !== false}
                      disabled={savingNotifications}
                      onChange={(v) => {
                        onPersistNotificationPrefs({ ...notificationPrefs, job_alert_notifications_enabled: v });
                      }}
                    />
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4">
                    {jobAlertModalBody || (
                      <p className="text-sm text-gray-700">
                        Use the <span className="font-medium">Job alert filters</span> collapsible card on the Notifications tab to
                        set trade, pay, distance, duration, and channels. Save from that card, or press Save here after editing there.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {item.persistence === 'local_only' && local && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Frequency (preview)</p>
                    <SettingsSelect
                      value={local.frequency}
                      onChange={(e) => {
                        setLocal((s) => ({ ...s, frequency: e.target.value }));
                        markDirty();
                      }}
                    >
                      <option value="immediate">Immediately</option>
                      <option value="hourly">Hourly digest</option>
                      <option value="daily">Daily digest</option>
                      <option value="weekly">Weekly summary</option>
                      <option value="never">Never</option>
                    </SettingsSelect>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quiet hours (preview)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600">
                        Start
                        <input
                          type="time"
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          value={local.quietStart}
                          onChange={(e) => {
                            setLocal((s) => ({ ...s, quietStart: e.target.value }));
                            markDirty();
                          }}
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        End
                        <input
                          type="time"
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          value={local.quietEnd}
                          onChange={(e) => {
                            setLocal((s) => ({ ...s, quietEnd: e.target.value }));
                            markDirty();
                          }}
                        />
                      </label>
                    </div>
                    <label className="text-xs text-gray-600 block">
                      Time zone
                      <input
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        value={local.timezone}
                        onChange={(e) => {
                          setLocal((s) => ({ ...s, timezone: e.target.value }));
                          markDirty();
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={local.respectQuietHours}
                        onChange={(e) => {
                          setLocal((s) => ({ ...s, respectQuietHours: e.target.checked }));
                          markDirty();
                        }}
                      />
                      Respect quiet hours
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={local.bypassQuietForUrgent}
                        onChange={(e) => {
                          setLocal((s) => ({ ...s, bypassQuietForUrgent: e.target.checked }));
                          markDirty();
                        }}
                      />
                      Bypass quiet hours for urgent updates
                    </label>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Urgency (preview)</p>
                    <SettingsSelect
                      value={local.urgency}
                      onChange={(e) => {
                        setLocal((s) => ({ ...s, urgency: e.target.value }));
                        markDirty();
                      }}
                    >
                      <option value="normal">Normal</option>
                      <option value="important">Important</option>
                      <option value="critical">Critical only</option>
                    </SettingsSelect>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/80 to-white p-4 sticky top-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Preview</p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {item.title}
                  {item.persistence === 'local_only' && local && (
                    <span className="block text-xs font-normal text-gray-600 mt-1">
                      {local.frequency === 'immediate' ? 'Sends as events occur' : `Digest: ${local.frequency}`}
                    </span>
                  )}
                </p>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Example: “{item.title} — short update about your TechFlash activity.”
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <SettingsBadge variant="muted">Example CTA</SettingsBadge>
                  <SettingsBadge variant="orange">View in TechFlash</SettingsBadge>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3 shrink-0 bg-gray-50/80">
          {dirty && item?.persistence === 'local_only' && (
            <span className="mr-auto text-xs font-medium text-amber-800">Unsaved preview</span>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Reset to default
          </button>
          <button type="button" onClick={handleClose} className="px-3 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={
              savingJobAlertForm ||
              savingNotifications ||
              (item.persistence === 'user_email_category' && !draft) ||
              (item.persistence === 'local_only' && !local)
            }
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {item.id === 'new_job_alerts' && isTechnician ? 'Save job alert preferences' : 'Save preferences'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
