import React from 'react';
import { RoleBadge } from './MessageBadges';
import { formatDateTime } from './messagesUi';

export default function MessageThread({ thread, isAdmin }) {
  const visible = (thread || []).filter((item) => !item.isInternalNote || isAdmin);

  if (!visible.length) {
    return (
      <div className="p-8 text-center text-sm text-gray-500" role="status">
        No messages in this thread yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-5" role="log" aria-label="Conversation thread">
      {visible.map((item) => (
        <article
          key={item.id}
          className={`rounded-xl border p-4 ${
            item.isInternalNote
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-gray-200 shadow-sm'
          }`}
        >
          {item.isInternalNote && (
            <span className="inline-block mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
              Internal note
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-gray-900">{item.senderName}</span>
            <RoleBadge role={item.senderRole} />
            <time
              className="text-xs text-gray-400 ml-auto tabular-nums"
              dateTime={item.createdAt}
            >
              {formatDateTime(item.createdAt)}
            </time>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{item.body}</p>
        </article>
      ))}
    </div>
  );
}
