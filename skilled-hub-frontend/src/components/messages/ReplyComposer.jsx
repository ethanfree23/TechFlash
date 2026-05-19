import React from 'react';
import { CANNED_RESPONSES } from './constants';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLASS, SELECT_CLASS } from './messagesUi';

export default function ReplyComposer({
  isAdmin,
  isFeedbackThread,
  composerText,
  onComposerChange,
  replyMode,
  onReplyModeChange,
  onSend,
  onMarkResolved,
  onArchive,
  onCannedSelect,
}) {
  const placeholder = isAdmin
    ? 'Write a public reply or switch to an internal note…'
    : 'Write your reply…';

  const sendDisabled = !composerText.trim();

  return (
    <div className="border-t border-gray-200 bg-white p-4 space-y-3 shrink-0">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50"
            role="group"
            aria-label="Reply type"
          >
            <button
              type="button"
              onClick={() => onReplyModeChange('public')}
              aria-pressed={replyMode === 'public'}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                replyMode === 'public'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Public reply
            </button>
            <button
              type="button"
              onClick={() => onReplyModeChange('internal')}
              aria-pressed={replyMode === 'internal'}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                replyMode === 'internal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Internal note
            </button>
          </div>
          <select
            className={SELECT_CLASS}
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const canned = CANNED_RESPONSES.find((c) => c.id === id);
              if (canned) onCannedSelect(canned.text);
              e.target.value = '';
            }}
            aria-label="Insert canned response"
          >
            <option value="">Insert canned response…</option>
            {CANNED_RESPONSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {isFeedbackThread && isAdmin && replyMode === 'public' && (
        <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" role="status">
          Public replies are emailed to the submitter. Use internal notes for team-only context.
        </p>
      )}

      <label htmlFor="message-reply" className="sr-only">
        Message reply
      </label>
      <textarea
        id="message-reply"
        value={composerText}
        onChange={(e) => onComposerChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`${INPUT_CLASS} resize-none`}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSend(composerText, { internal: replyMode === 'internal' })}
          disabled={sendDisabled}
          className={BTN_PRIMARY}
        >
          {isAdmin && replyMode === 'internal' ? 'Save note' : 'Send reply'}
        </button>
        <button type="button" onClick={onMarkResolved} className={BTN_SECONDARY}>
          Mark resolved
        </button>
        <button type="button" onClick={onArchive} className={BTN_SECONDARY}>
          Archive
        </button>
      </div>
    </div>
  );
}
