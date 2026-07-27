import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from 'react-modal';
import { TypeBadge, StatusBadge, PriorityBadge, RoleBadge } from './MessageBadges';
import MessageThread from './MessageThread';
import ReplyComposer from './ReplyComposer';
import AdminActionBar from './AdminActionBar';
import MessageDetailSkeleton from './MessageDetailSkeleton';
import { CARD_CLASS, PANEL_HEIGHT, formatDateTime } from './messagesUi';

const COPIED_MESSAGES_STORAGE_KEY = 'techflash-copied-message-ids-v1';

function loadCopiedIdsByConversation() {
  try {
    const raw = window.localStorage.getItem(COPIED_MESSAGES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCopiedIdsByConversation(map) {
  try {
    window.localStorage.setItem(COPIED_MESSAGES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

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
  composerAttachments,
  onComposerAttachmentsChange,
  onNotify,
}) {
  const [focusOpen, setFocusOpen] = useState(false);
  const [copiedThreadItemIds, setCopiedThreadItemIds] = useState([]);

  const attachmentLinks = useMemo(() => {
    const links = [];
    (message?.thread || []).forEach((item) => {
      (item.attachments || []).forEach((attachment) => {
        if (attachment?.url) links.push(attachment.url);
      });
    });
    return links;
  }, [message]);

  useEffect(() => {
    if (!message?.id) {
      setCopiedThreadItemIds([]);
      return;
    }
    const store = loadCopiedIdsByConversation();
    const ids = Array.isArray(store[message.id]) ? store[message.id] : [];
    setCopiedThreadItemIds(ids.map((id) => String(id)));
  }, [message?.id]);

  if (!message) {
    return <DetailPlaceholder />;
  }

  const markMessagesCopied = (messageIds) => {
    const normalized = Array.from(new Set((messageIds || []).map((id) => String(id))));
    if (normalized.length === 0) return;
    setCopiedThreadItemIds((prev) => {
      const next = Array.from(new Set([...prev, ...normalized]));
      const store = loadCopiedIdsByConversation();
      store[message.id] = next;
      saveCopiedIdsByConversation(store);
      return next;
    });
  };

  const copyText = async (text, successMessage) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.({ message: successMessage, variant: 'success' });
      return true;
    } catch {
      onNotify?.({ message: 'Copy failed in this browser context.', variant: 'error' });
      return false;
    }
  };

  const copyReport = () => {
    const lines = [
      `Subject: ${message.subject || ''}`,
      `Type: ${message.type || ''}`,
      `Status: ${message.status || ''}`,
      `Priority: ${message.priority || ''}`,
      `From: ${message.senderName || ''}${message.senderEmail ? ` <${message.senderEmail}>` : ''}`,
      `Created: ${message.createdAt || ''}`,
      `Updated: ${message.updatedAt || ''}`,
      '',
      'Thread:',
    ];

    (message.thread || []).forEach((item, index) => {
      lines.push(`--- Message ${index + 1} ---`);
      lines.push(`Sender: ${item.senderName || ''} (${item.senderRole || ''})`);
      lines.push(`When: ${item.createdAt || ''}`);
      lines.push(item.body || '');
      if (Array.isArray(item.attachments) && item.attachments.length > 0) {
        lines.push('Attachments:');
        item.attachments.forEach((attachment) => {
          lines.push(`- ${attachment.filename || 'file'}: ${attachment.url || ''}`);
        });
      }
      lines.push('');
    });

    copyText(lines.join('\n'), 'Copied message report to clipboard.');
  };

  const copyNewMessages = async () => {
    const uncopiedItems = (message.thread || []).filter(
      (item) => !copiedThreadItemIds.includes(String(item.id)),
    );
    if (uncopiedItems.length === 0) {
      onNotify?.({ message: 'No new messages to copy.', variant: 'info' });
      return;
    }

    const lines = [
      `Subject: ${message.subject || ''}`,
      `Conversation ID: ${message.id}`,
      '',
      'New messages:',
    ];

    uncopiedItems.forEach((item, index) => {
      lines.push(`--- New Message ${index + 1} ---`);
      lines.push(`Message ID: ${item.id || ''}`);
      lines.push(`Sender: ${item.senderName || ''} (${item.senderRole || ''})`);
      lines.push(`When: ${item.createdAt || ''}`);
      lines.push(item.body || '');
      if (Array.isArray(item.attachments) && item.attachments.length > 0) {
        lines.push('Attachments:');
        item.attachments.forEach((attachment) => {
          lines.push(`- ${attachment.filename || 'file'}: ${attachment.url || ''}`);
        });
      }
      lines.push('');
    });

    const copied = await copyText(
      lines.join('\n'),
      `Copied ${uncopiedItems.length} new message${uncopiedItems.length > 1 ? 's' : ''}.`,
    );
    if (copied) {
      markMessagesCopied(uncopiedItems.map((item) => item.id));
    }
  };

  const copySingleMessage = async (item) => {
    if (!item) return;
    const lines = [
      `Subject: ${message.subject || ''}`,
      `Message ID: ${item.id || ''}`,
      `Sender: ${item.senderName || ''} (${item.senderRole || ''})`,
      `When: ${item.createdAt || ''}`,
      '',
      item.body || '',
    ];
    if (Array.isArray(item.attachments) && item.attachments.length > 0) {
      lines.push('', 'Attachments:');
      item.attachments.forEach((attachment) => {
        lines.push(`- ${attachment.filename || 'file'}: ${attachment.url || ''}`);
      });
    }
    const copied = await copyText(lines.join('\n'), 'Copied message content.');
    if (copied && item.id != null) {
      markMessagesCopied([item.id]);
    }
  };

  const copyAllImageLinks = () => {
    if (!attachmentLinks.length) {
      onNotify?.({ message: 'No attachments to copy yet.', variant: 'info' });
      return;
    }
    copyText(attachmentLinks.join('\n'), 'Copied attachment links to clipboard.');
  };

  const threadContent = (
    <>
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
          <MessageThread
            thread={message.thread}
            isAdmin={isAdmin}
            onNotify={onNotify}
            copiedMessageIds={copiedThreadItemIds}
            onCopyMessage={copySingleMessage}
          />
        )}
        <ReplyComposer
          isAdmin={isAdmin}
          isFeedbackThread={message.isFeedbackThread}
          composerText={composerText}
          onComposerChange={onComposerChange}
          composerAttachments={composerAttachments}
          onComposerAttachmentsChange={onComposerAttachmentsChange}
          replyMode={replyMode}
          onReplyModeChange={onReplyModeChange}
          onSend={onSend}
          onMarkResolved={onMarkResolved}
          onArchive={onArchive}
          onCannedSelect={onCannedSelect}
          onNotify={onNotify}
        />
      </div>
    </>
  );

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

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyReport} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            Copy report
          </button>
          <button type="button" onClick={copyNewMessages} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            Copy new messages
          </button>
          <button type="button" onClick={copyAllImageLinks} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            Copy image links
          </button>
          <button type="button" onClick={() => setFocusOpen(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            Open focus view
          </button>
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
          </nav>
        )}
      </header>

      {!focusOpen && threadContent}

      <Modal
        isOpen={focusOpen}
        onRequestClose={() => setFocusOpen(false)}
        contentLabel="Conversation focus view"
        ariaHideApp={false}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4"
        overlayClassName="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120]"
      >
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{message.subject}</h3>
            <button type="button" onClick={() => setFocusOpen(false)} className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{threadContent}</div>
        </div>
      </Modal>
    </section>
  );
}
