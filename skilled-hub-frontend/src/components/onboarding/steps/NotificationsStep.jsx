import React, { useEffect, useState } from 'react';
import { authAPI } from '../../../api/api';
import { getNotificationCategories } from '../../../config/notificationPreferenceCatalog';
import { OnboardingActions } from '../OnboardingShell';

export default function NotificationsStep({ user, onBack, onContinue, onSaved }) {
  const [prefs, setPrefs] = useState({
    email_notifications_enabled: true,
    job_alert_notifications_enabled: true,
    email_notification_preferences: {
      messages: true,
      job_lifecycle: true,
      reviews: true,
      membership_updates: true,
    },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pushAsked, setPushAsked] = useState(false);

  useEffect(() => {
    setPrefs({
      email_notifications_enabled: user?.email_notifications_enabled !== false,
      job_alert_notifications_enabled: user?.job_alert_notifications_enabled !== false,
      email_notification_preferences: {
        messages: true,
        job_lifecycle: true,
        reviews: true,
        membership_updates: true,
        ...(user?.email_notification_preferences || {}),
      },
    });
  }, [user]);

  const toggleMaster = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCategory = (category) => {
    setPrefs((prev) => ({
      ...prev,
      email_notification_preferences: {
        ...prev.email_notification_preferences,
        [category]: !prev.email_notification_preferences[category],
      },
    }));
  };

  const requestPush = async () => {
    setPushAsked(true);
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch {
      /* declining OS permissions must not block onboarding */
    }
  };

  const handleContinue = async () => {
    setSaving(true);
    setError('');
    try {
      await authAPI.updateMe({
        email_notifications_enabled: prefs.email_notifications_enabled,
        job_alert_notifications_enabled: prefs.job_alert_notifications_enabled,
        email_notification_preferences: prefs.email_notification_preferences,
      });
      await onSaved?.();
      onContinue();
    } catch (e) {
      setError(e.message || 'Could not save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  const persisted = getNotificationCategories('technician').filter((item) => item.persistence !== 'local_only');

  return (
    <div>
      <p className="text-sm text-slate-600 mb-5">
        Stay ahead of new job opportunities. Transactional account messages may still be sent when required;
        optional alerts below are under your control.
      </p>

      <div className="space-y-3">
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={prefs.job_alert_notifications_enabled}
            onChange={() => toggleMaster('job_alert_notifications_enabled')}
          />
          <span>
            <span className="block font-semibold text-slate-900">New job alerts</span>
            <span className="block text-sm text-slate-600">Recommended — get matching jobs as soon as they go live.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={prefs.email_notifications_enabled}
            onChange={() => toggleMaster('email_notifications_enabled')}
          />
          <span>
            <span className="block font-semibold text-slate-900">Email notifications</span>
            <span className="block text-sm text-slate-600">Master switch for email categories below.</span>
          </span>
        </label>

        {persisted
          .filter((item) => item.persistence === 'user_email_category')
          .map((item) => (
            <label key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={!!prefs.email_notification_preferences[item.emailCategory]}
                onChange={() => toggleCategory(item.emailCategory)}
                disabled={!prefs.email_notifications_enabled}
              />
              <span>
                <span className="block font-semibold text-slate-900">{item.title}</span>
                <span className="block text-sm text-slate-600">{item.description}</span>
              </span>
            </label>
          ))}
      </div>

      <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-sm font-semibold text-sky-950">Push notifications</p>
        <p className="mt-1 text-sm text-sky-900/80">
          Optional. Declining OS permission will not block setup.
        </p>
        <button
          type="button"
          onClick={requestPush}
          className="mt-3 min-h-11 rounded-xl border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-900"
        >
          {pushAsked ? 'Permission requested' : 'Enable push notifications'}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <div className="mt-8">
        <OnboardingActions onBack={onBack} onContinue={handleContinue} loading={saving} continueLabel="Save & Continue" />
      </div>
    </div>
  );
}
