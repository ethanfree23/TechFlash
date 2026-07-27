import React from 'react';
import { RoleBadge } from './MessageBadges';
import { formatDateTime } from './messagesUi';
import { humanFileSize } from './attachmentUtils';

export default function MessageThread({
  thread,
  isAdmin,
  onNotify,
  copiedMessageIds = [],
  onCopyMessage,
}) {
  const visible = (thread || []).filter((item) => !item.isInternalNote || isAdmin);
  const canWriteClipboardImage = typeof ClipboardItem !== 'undefined';

  const copyAttachmentLink = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onNotify?.({ message: 'Attachment link copied.', variant: 'success' });
    } catch {
      onNotify?.({ message: 'Could not copy attachment link.', variant: 'error' });
    }
  };

  const copyAttachmentImage = async (attachment) => {
    if (!attachment?.url) return;
    if (!canWriteClipboardImage) {
      onNotify?.({ message: 'Image copy is not supported in this browser.', variant: 'info' });
      return;
    }
    try {
      const response = await fetch(attachment.url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type || attachment.content_type || 'image/png']: blob,
        }),
      ]);
      onNotify?.({ message: `Copied ${attachment.filename || 'image'} to clipboard.`, variant: 'success' });
    } catch {
      onNotify?.({ message: 'Could not copy this image; use copy link instead.', variant: 'error' });
    }
  };

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
            {copiedMessageIds.includes(String(item.id)) && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                Copied
              </span>
            )}
            <button
              type="button"
              onClick={() => onCopyMessage?.(item)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-gray-500 hover:text-blue-700 hover:bg-blue-50"
              aria-label="Copy this message content"
              title="Copy this message"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <time
              className="text-xs text-gray-400 ml-auto tabular-nums"
              dateTime={item.createdAt}
            >
              {formatDateTime(item.createdAt)}
            </time>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{item.body}</p>
          {Array.isArray(item.attachments) && item.attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {item.attachments.map((attachment) => {
                const isImage = String(attachment.content_type || '').startsWith('image/');
                return (
                  <div key={attachment.id || attachment.url || attachment.filename} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    {isImage && attachment.url && (
                      <img
                        src={attachment.url}
                        alt={attachment.filename || 'Attachment preview'}
                        className="mb-2 max-h-56 w-auto rounded border border-gray-200"
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">{attachment.filename || 'Attachment'}</span>
                      <span>{humanFileSize(attachment.byte_size)}</span>
                      {attachment.url && (
                        <>
                          {isImage && (
                            <button
                              type="button"
                              onClick={() => copyAttachmentImage(attachment)}
                              className="font-semibold text-blue-600 hover:text-blue-800"
                            >
                              Copy image
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyAttachmentLink(attachment.url)}
                            className="font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Copy link
                          </button>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Open
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
