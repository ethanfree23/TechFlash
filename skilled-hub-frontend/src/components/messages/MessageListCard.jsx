import React from 'react';
import { TypeBadge, PriorityBadge, StatusBadge } from './MessageBadges';
import { formatRelativeTime } from './messagesUi';

export default function MessageListCard({ message, isSelected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      className={`w-full text-left px-4 py-3.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
        isSelected
          ? 'bg-blue-50/80 border-l-4 border-l-blue-600'
          : 'border-l-4 border-l-transparent hover:bg-gray-50/90'
      } ${message.isUnread && !isSelected ? 'bg-gray-50/70' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <TypeBadge type={message.type} />
          <PriorityBadge priority={message.priority} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {message.isUnread && (
            <span className="w-2 h-2 rounded-full bg-tf-orange" title="Unread" aria-label="Unread" />
          )}
          <time
            className="text-[10px] text-gray-400 whitespace-nowrap tabular-nums"
            dateTime={message.updatedAt || message.createdAt}
          >
            {formatRelativeTime(message.updatedAt || message.createdAt)}
          </time>
        </div>
      </div>
      <h4
        className={`text-sm truncate pr-1 ${message.isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}
      >
        {message.subject}
      </h4>
      <p className="text-xs text-gray-500 mt-0.5 truncate">{message.senderName}</p>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{message.preview}</p>
      <div className="flex items-center justify-between mt-2.5 gap-2">
        <StatusBadge status={message.status} />
        {message.relatedJobId && (
          <span className="text-[10px] font-medium text-gray-400 truncate">Job #{message.relatedJobId}</span>
        )}
      </div>
    </button>
  );
}
