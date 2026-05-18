import React from 'react';
import { FaExclamationCircle, FaRedo, FaSearch, FaUserCheck, FaUserClock, FaUsers } from 'react-icons/fa';

const VARIANTS = {
  default: {
    icon: FaUsers,
    title: 'No users found',
    description: 'Try adjusting your filters or search terms.',
    actionLabel: 'View all users',
  },
  no_users: {
    icon: FaUsers,
    title: 'No users yet',
    description: 'Create or invite the first technician or company account to get started.',
    actionLabel: 'Create user',
  },
  search: {
    icon: FaSearch,
    title: 'No results for your search',
    description: 'Try a different name, email, company, or trade keyword.',
    actionLabel: 'Clear search',
  },
  filtered: {
    icon: FaSearch,
    title: 'No results matching filters',
    description: 'Remove one or more filters, or switch to a different saved view.',
    actionLabel: 'Clear filters',
  },
  error: {
    icon: FaExclamationCircle,
    title: 'Could not load users',
    description: 'There was a problem fetching user data. Check your connection and try again.',
    actionLabel: 'Retry',
  },
  technicians: {
    icon: FaUsers,
    title: 'No technicians yet',
    description: 'Technician accounts will appear here once they sign up or are created.',
    actionLabel: 'Create technician',
  },
  pending: {
    icon: FaUserClock,
    title: 'No pending verifications',
    description: 'Every account is currently cleared. New users needing review will appear here.',
    actionLabel: 'View all users',
  },
  flagged: {
    icon: FaExclamationCircle,
    title: 'No flagged accounts',
    description: 'No users are currently flagged for risk review.',
    actionLabel: 'View all users',
  },
  admins: {
    icon: FaUserCheck,
    title: 'Admin accounts not listed here',
    description: 'Platform admin logins are managed separately and are not included in this user index.',
    actionLabel: 'View all users',
  },
};

export default function UsersEmptyState({ variant = 'default', onAction }) {
  const cfg = VARIANTS[variant] || VARIANTS.default;
  const Icon = variant === 'error' ? FaRedo : cfg.icon;

  return (
    <div className="rounded-xl border border-dashed border-slate-200/80 bg-white px-5 py-10 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 border border-slate-200 text-slate-400">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-slate-900">{cfg.title}</p>
      <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">{cfg.description}</p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center px-3.5 py-1.5 rounded-lg bg-tf-blue text-white text-xs font-semibold hover:bg-tf-blue-dark transition-colors"
        >
          {cfg.actionLabel}
        </button>
      )}
    </div>
  );
}
