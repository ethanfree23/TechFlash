export const MESSAGE_TYPES = {
  problem: {
    label: 'Problem',
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
    description: 'Something is broken or not working',
  },
  suggestion: {
    label: 'Suggestion',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
    description: 'Product or feature suggestion',
  },
  feedback: {
    label: 'Feedback',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'General platform feedback',
  },
  general: {
    label: 'General',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'General message',
  },
  job: {
    label: 'Job Message',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Message related to a job',
  },
  support: {
    label: 'Support',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'Support request',
  },
  announcement: {
    label: 'Announcement',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    description: 'Platform/admin announcement',
  },
};

export const MESSAGE_STATUSES = {
  open: { label: 'Open', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending: { label: 'Pending', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: 'Resolved', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  archived: { label: 'Archived', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const MESSAGE_PRIORITIES = {
  urgent: { label: 'Urgent', badgeClass: 'bg-red-100 text-red-800 border-red-200', order: 0 },
  high: { label: 'High', badgeClass: 'bg-orange-100 text-orange-800 border-orange-200', order: 1 },
  normal: { label: 'Normal', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', order: 2 },
  low: { label: 'Low', badgeClass: 'bg-slate-50 text-slate-500 border-slate-200', order: 3 },
};

export const ROLE_LABELS = {
  admin: { label: 'Admin', badgeClass: 'bg-slate-800 text-white' },
  company: { label: 'Company', badgeClass: 'bg-blue-100 text-blue-800' },
  technician: { label: 'Technician', badgeClass: 'bg-emerald-100 text-emerald-800' },
};

export const ADMIN_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'problems', label: 'Problems', types: ['problem'] },
  { id: 'suggestions', label: 'Suggestions', types: ['suggestion'] },
  { id: 'feedback', label: 'Feedback', types: ['feedback'] },
  { id: 'general', label: 'General', types: ['general'] },
  { id: 'archived', label: 'Archived', statuses: ['archived'] },
];

export const USER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'jobs', label: 'Jobs', types: ['job'] },
  { id: 'support', label: 'Support', types: ['support'] },
  { id: 'announcements', label: 'Announcements', types: ['announcement'] },
  { id: 'archived', label: 'Archived', statuses: ['archived'] },
];

export const CANNED_RESPONSES = [
  { id: 'thanks', label: 'Thanks for the feedback', text: 'Thank you for taking the time to share your feedback. We really appreciate it and will use it to improve TechFlash.' },
  { id: 'looking', label: 'We are looking into this', text: 'Thanks for reporting this. Our team is looking into it and we will follow up with an update as soon as we have more information.' },
  { id: 'resolved', label: 'Issue resolved', text: 'This issue has been resolved. Please let us know if you experience anything further — we are happy to help.' },
  { id: 'details', label: 'Request more details', text: 'Could you share a few more details so we can investigate? Screenshots, job IDs, or steps to reproduce would be very helpful.' },
  { id: 'sales', label: 'Sales call follow-up', text: 'Thanks for your interest in TechFlash. A member of our team will reach out shortly to schedule a call and walk you through the platform.' },
  { id: 'onboarding', label: 'Platform onboarding help', text: 'Welcome to TechFlash! Here is a quick guide to get started: complete your profile, browse available jobs, and reach out if you need help at any step.' },
];

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'priority', label: 'Priority' },
  { id: 'unread', label: 'Unread first' },
];

export const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All statuses' },
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Pending' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'archived', label: 'Archived' },
];

export const PRIORITY_FILTER_OPTIONS = [
  { id: 'all', label: 'All priorities' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'normal', label: 'Normal' },
  { id: 'low', label: 'Low' },
];

export const SUBTITLES = {
  admin: 'Manage feedback, support requests, suggestions, and inbound platform messages.',
  company: 'Stay on top of job updates, technician conversations, and platform notices.',
  technician: 'Track job conversations, company updates, and messages from TechFlash.',
};

export const TOAST = {
  replySent: 'Reply sent successfully.',
  noteAdded: 'Internal note saved.',
  replyFailed: 'Could not send your reply. Please try again.',
  markedResolved: 'Conversation marked as resolved.',
  archived: 'Message archived.',
  deleted: 'Message removed from your inbox.',
  messageSent: 'Message sent.',
  exported: 'Inbox exported to CSV.',
  priorityUpdated: 'Priority updated.',
  statusUpdated: 'Status updated.',
  assigned: 'Message assigned.',
  unassigned: 'Assignment cleared.',
  threadSyncFailed: 'Could not refresh this conversation.',
  syncFailed: 'Could not save changes. Try again.',
};

export const FEEDBACK_TYPE_OPTIONS = [
  { id: 'problem', label: 'Problem' },
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'general', label: 'General' },
];
