import React from 'react';
import { Link } from 'react-router-dom';
import { TypeBadge, StatusBadge, PriorityBadge, RoleBadge } from './MessageBadges';
import MessageThread from './MessageThread';
import ReplyComposer from './ReplyComposer';
import AdminActionBar from './AdminActionBar';
import MessageDetailSkeleton from './MessageDetailSkeleton';
import { CARD_CLASS, PANEL_HEIGHT, formatDateTime } from './messagesUi';

function DetailPlaceholder() {
  return (
    <section
      className={`hidden lg:flex flex-col items-center justify-center ${CARD_CLASS} ${PANEL_HEIGHT} text-gray-500 p-10 text-center`}
      aria-label="No message selected"
    >
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-800">Select a conversation</p>
      <p className="mt-1 text-sm text-gray-500 max-w-xs">
        Choose a message from your inbox to read the full thread and reply.
      </p>
    </section>
  );
}

export default function MessageDetailPanel({
  message,
  isAdmin,
  detailLoading,
  onBack,
  showBack,
  composerText,
  onComposerChange,
  replyMode,
  onReplyModeChange,
  onSend,
  onMarkResolved,
  onArchive,
  onCannedSelect,
  onAssign,
  onPriorityChange,
  onStatusChange,
  onDeleteRequest,
  onPlaceholderAction,
}) {
  if (!message) {
    return <DetailPlaceholder />;
  }

  return (
    <section className={`flex flex-col ${CARD_CLASS} ${PANEL_HEIGHT}`} aria-label="Conversation detail">
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          className="lg:hidden flex items-center gap-1.5 px-4 py-3 text-sm text-blue-600 font-semibold border-b border-gray-100 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to inbox
        </button>
      )}

      <header className="sticky top-0 z-10 px-4 sm:px-5 py-4 border-b border-gray-100 bg-white shrink-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <TypeBadge type={message.type} />
          <StatusBadge status={message.status} />
          <PriorityBadge priority={message.priority} />
          <time
            className="text-xs text-gray-400 ml-auto tabular-nums"
            dateTime={message.createdAt}
          >
            {formatDateTime(message.createdAt)}
          </time>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 leading-snug">{message.subject}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-gray-800">{message.senderName}</span>
          {message.senderEmail && (
            <span className="text-gray-500 text-xs">&lt;{message.senderEmail}&gt;</span>
          )}
          <RoleBadge role={message.senderRole} />
        </div>

        {isAdmin && (
          <nav className="mt-3 flex flex-wrap gap-3" aria-label="Related records">
            {message.relatedJobId && (
              <Link
                to={`/jobs/${message.relatedJobId}`}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
              >
                View job
              </Link>
            )}
            {message.relatedCompanyId && (
              <button
                type="button"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
                onClick={() => onPlaceholderAction?.('View company')}
              >
                View company
              </button>
            )}
            {message.relatedTechnicianId && (
              <button
                type="button"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
                onClick={() => onPlaceholderAction?.('View user')}
              >
                View user
              </button>
            )}
            <Link
              to="/crm"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
            >
              Open in CRM
            </Link>
          </nav>
        )}
      </header>

      {isAdmin && (
        <AdminActionBar
          message={message}
          onAssign={onAssign}
          onPriorityChange={onPriorityChange}
          onStatusChange={onStatusChange}
          onArchive={onArchive}
          onDeleteRequest={onDeleteRequest}
          onPlaceholderAction={onPlaceholderAction}
        />
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {detailLoading ? (
          <MessageDetailSkeleton />
        ) : (
          <MessageThread thread={message.thread} isAdmin={isAdmin} />
        )}
      </div>

      <ReplyComposer
        isAdmin={isAdmin}
        isFeedbackThread={message.isFeedbackThread}
        composerText={composerText}
        onComposerChange={onComposerChange}
        replyMode={replyMode}
        onReplyModeChange={onReplyModeChange}
        onSend={onSend}
        onMarkResolved={onMarkResolved}
        onArchive={onArchive}
        onCannedSelect={onCannedSelect}
      />
    </section>
  );
}
