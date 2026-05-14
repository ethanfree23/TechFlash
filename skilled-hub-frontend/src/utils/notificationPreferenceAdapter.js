/**
 * Maps catalog entries to persisted user / job-alert fields only.
 * TODO(backend): extend when API supports per-category channels, digests, quiet hours.
 */

export function isCategoryEnabled(item, notificationPrefs) {
  if (item.persistence === 'job_alert_master') {
    return notificationPrefs.job_alert_notifications_enabled !== false;
  }
  if (item.persistence === 'user_email_category' && item.emailCategory) {
    return (
      notificationPrefs.email_notifications_enabled !== false &&
      notificationPrefs.email_notification_preferences?.[item.emailCategory] !== false
    );
  }
  return true;
}

export function channelSummaryForItem(item, notificationPrefs, jobAlertForm, { isTechnician }) {
  const emailOn =
    item.persistence === 'user_email_category'
      ? notificationPrefs.email_notifications_enabled !== false &&
        notificationPrefs.email_notification_preferences?.[item.emailCategory] !== false
      : item.persistence === 'job_alert_master'
        ? notificationPrefs.job_alert_notifications_enabled !== false &&
          notificationPrefs.email_notifications_enabled !== false &&
          !!jobAlertForm?.email_enabled
        : false;

  const smsOn =
    item.persistence === 'job_alert_master' && isTechnician ? !!jobAlertForm?.sms_enabled : false;
  const inAppOn =
    item.persistence === 'job_alert_master' && isTechnician ? !!jobAlertForm?.app_enabled : false;

  if (item.persistence === 'local_only') {
    return {
      email: 'preview',
      sms: 'soon',
      push: 'soon',
      inApp: 'soon',
    };
  }

  return {
    email: emailOn ? 'on' : 'off',
    sms: item.persistence === 'job_alert_master' ? (smsOn ? 'on' : 'off') : 'soon',
    push: 'soon',
    inApp: item.persistence === 'job_alert_master' ? (inAppOn ? 'on' : 'off') : 'soon',
  };
}

export function frequencySummaryForItem(item) {
  if (item.persistence === 'job_alert_master') return 'Real-time when jobs match';
  if (item.persistence === 'user_email_category') return 'Email as events occur';
  return 'Not persisted (preview)';
}
