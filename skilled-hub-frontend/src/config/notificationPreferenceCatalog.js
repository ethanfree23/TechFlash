/**
 * Notification preference catalog for Settings UI.
 * persistence:
 * - user_email_category: maps to users.email_notification_preferences[emailCategory]
 * - job_alert_master: maps to users.job_alert_notifications_enabled
 * - local_only: UI only until backend exists (TODO(backend))
 */
const ICON = {
  bell: 'bell',
  mail: 'mail',
  briefcase: 'briefcase',
  shield: 'shield',
  currency: 'currency',
  megaphone: 'megaphone',
  users: 'users',
  chart: 'chart',
};

const technician = [
  {
    id: 'new_job_alerts',
    icon: ICON.bell,
    title: 'New job alerts',
    description: 'When matching jobs go live near you based on your filters.',
    persistence: 'job_alert_master',
  },
  {
    id: 'messages',
    icon: ICON.mail,
    title: 'Messages',
    description: 'Direct messages from companies about jobs you are discussing.',
    persistence: 'user_email_category',
    emailCategory: 'messages',
  },
  {
    id: 'job_lifecycle',
    icon: ICON.briefcase,
    title: 'Job lifecycle updates',
    description: 'Applications, acceptances, schedule changes, and completions.',
    persistence: 'user_email_category',
    emailCategory: 'job_lifecycle',
  },
  {
    id: 'reviews',
    icon: ICON.chart,
    title: 'Reviews and reminders',
    description: 'Review requests and reminders after completed work.',
    persistence: 'user_email_category',
    emailCategory: 'reviews',
  },
  {
    id: 'membership_updates',
    icon: ICON.currency,
    title: 'Membership and billing',
    description: 'Tier changes, invoices, and subscription-related notices.',
    persistence: 'user_email_category',
    emailCategory: 'membership_updates',
  },
  {
    id: 'application_updates',
    icon: ICON.briefcase,
    title: 'Application updates',
    description: 'Submitted, viewed, accepted, rejected, cancelled, or filled by someone else.',
    persistence: 'local_only',
  },
  {
    id: 'payment_payouts',
    icon: ICON.currency,
    title: 'Payment and payouts',
    description: 'Processing, payouts sent or failed, and weekly earnings summaries.',
    persistence: 'local_only',
  },
  {
    id: 'safety_compliance',
    icon: ICON.shield,
    title: 'Safety and compliance',
    description: 'Important safety notices and compliance reminders.',
    persistence: 'local_only',
  },
  {
    id: 'announcements',
    icon: ICON.megaphone,
    title: 'Marketplace announcements',
    description: 'Product updates and marketplace news (non-critical).',
    persistence: 'local_only',
  },
];

const company = [
  {
    id: 'new_applicants',
    icon: ICON.users,
    title: 'New applicant alerts',
    description: 'When technicians apply to your open roles.',
    persistence: 'local_only',
  },
  {
    id: 'messages',
    icon: ICON.mail,
    title: 'Messages',
    description: 'Conversations with technicians about jobs.',
    persistence: 'user_email_category',
    emailCategory: 'messages',
  },
  {
    id: 'job_lifecycle',
    icon: ICON.briefcase,
    title: 'Job posting updates',
    description: 'Approvals, go-live, fills, cancellations, and check-ins.',
    persistence: 'user_email_category',
    emailCategory: 'job_lifecycle',
  },
  {
    id: 'reviews',
    icon: ICON.chart,
    title: 'Reviews and ratings',
    description: 'Feedback about your company and reminders to leave reviews.',
    persistence: 'user_email_category',
    emailCategory: 'reviews',
  },
  {
    id: 'membership_updates',
    icon: ICON.currency,
    title: 'Membership and billing',
    description: 'Subscription, invoices, and platform fee notices.',
    persistence: 'user_email_category',
    emailCategory: 'membership_updates',
  },
  {
    id: 'payment_invoices',
    icon: ICON.currency,
    title: 'Payments and invoices',
    description: 'Receipts, failed charges, and renewal notices.',
    persistence: 'local_only',
  },
  {
    id: 'announcements',
    icon: ICON.megaphone,
    title: 'Marketplace announcements',
    description: 'Product updates and marketplace news (non-critical).',
    persistence: 'local_only',
  },
];

const admin = [
  {
    id: 'signup_alerts',
    icon: ICON.users,
    title: 'New signups',
    description: 'Companies and technicians joining the marketplace.',
    persistence: 'local_only',
  },
  {
    id: 'verification_queue',
    icon: ICON.shield,
    title: 'Verification queue',
    description: 'Licenses, profile completion, and pending reviews.',
    persistence: 'local_only',
  },
  {
    id: 'zero_applicant_jobs',
    icon: ICON.briefcase,
    title: 'Jobs with zero applicants',
    description: 'Stale listings that may need pricing or visibility help.',
    persistence: 'local_only',
  },
  {
    id: 'failed_payments',
    icon: ICON.currency,
    title: 'Failed payments and payouts',
    description: 'Stripe issues and payout exceptions.',
    persistence: 'local_only',
  },
  {
    id: 'messages',
    icon: ICON.mail,
    title: 'Messages and threads',
    description: 'Optional non-critical messaging digests for admin accounts.',
    persistence: 'user_email_category',
    emailCategory: 'messages',
  },
  {
    id: 'job_lifecycle',
    icon: ICON.briefcase,
    title: 'Job lifecycle digests',
    persistence: 'user_email_category',
    emailCategory: 'job_lifecycle',
  },
  {
    id: 'reviews',
    icon: ICON.chart,
    title: 'Reviews and reminders',
    persistence: 'user_email_category',
    emailCategory: 'reviews',
  },
  {
    id: 'membership_updates',
    icon: ICON.currency,
    title: 'Membership and billing',
    persistence: 'user_email_category',
    emailCategory: 'membership_updates',
  },
  {
    id: 'daily_report',
    icon: ICON.chart,
    title: 'Daily marketplace report',
    persistence: 'local_only',
  },
];

export function getNotificationCategories(role) {
  if (role === 'technician') return technician;
  if (role === 'company') return company;
  if (role === 'admin') return admin;
  return [];
}

export { ICON };
