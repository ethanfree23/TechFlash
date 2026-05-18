import React from 'react';
import { MESSAGE_PRIORITIES, MESSAGE_STATUSES } from './constants';
import { SELECT_CLASS, BTN_SECONDARY } from './messagesUi';

export default function AdminActionBar({
  message,
  onAssign,
  onPriorityChange,
  onStatusChange,
  onArchive,
  onDeleteRequest,
  onPlaceholderAction,
}) {
  if (!message) return null;

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Admin actions</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={message.assignedTo || ''}
          onChange={(e) => onAssign(e.target.value || null)}
          className={SELECT_CLASS}
          aria-label="Assign message"
        >
          <option value="">Unassigned</option>
          <option value="Admin">Admin</option>
          <option value="Support Team">Support team</option>
        </select>
        <select
          value={message.priority}
          onChange={(e) => onPriorityChange(e.target.value)}
          className={SELECT_CLASS}
          aria-label="Change priority"
        >
          {Object.keys(MESSAGE_PRIORITIES).map((p) => (
            <option key={p} value={p}>
              {MESSAGE_PRIORITIES[p].label}
            </option>
          ))}
        </select>
        <select
          value={message.status}
          onChange={(e) => onStatusChange(e.target.value)}
          className={SELECT_CLASS}
          aria-label="Change status"
        >
          {Object.keys(MESSAGE_STATUSES).map((s) => (
            <option key={s} value={s}>
              {MESSAGE_STATUSES[s].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPlaceholderAction?.('Convert to CRM task')}
          className={BTN_SECONDARY}
        >
          CRM task
        </button>
        <button
          type="button"
          onClick={() => onPlaceholderAction?.('Convert to bug report')}
          className={BTN_SECONDARY}
        >
          Bug report
        </button>
        <button
          type="button"
          onClick={() => onPlaceholderAction?.('Convert to feature request')}
          className={BTN_SECONDARY}
        >
          Feature request
        </button>
        <button
          type="button"
          onClick={() => onPlaceholderAction?.('Send follow-up email')}
          className={BTN_SECONDARY}
        >
          Follow-up email
        </button>
        <button type="button" onClick={onArchive} className={BTN_SECONDARY}>
          Archive
        </button>
        <button
          type="button"
          onClick={onDeleteRequest}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 font-medium transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
