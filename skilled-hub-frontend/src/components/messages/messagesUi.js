/** Shared UI tokens and helpers for the Messages center */

export const CARD_CLASS =
  'bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden';

export const PANEL_HEIGHT = 'min-h-[420px] lg:min-h-[calc(100vh-17rem)] lg:max-h-[calc(100vh-17rem)]';

export const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

export const SELECT_CLASS =
  'text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-tf-orange text-white text-sm font-semibold hover:bg-tf-orange-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-tf-orange disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors';

export function formatRelativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
