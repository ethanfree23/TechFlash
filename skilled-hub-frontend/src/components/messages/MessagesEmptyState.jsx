import React from 'react';
import EmptyState from '../settings/EmptyState';
import { BTN_PRIMARY } from './messagesUi';

export default function MessagesEmptyState({ isAdmin, onCreateTest, onContactSupport }) {
  return (
    <div className="py-8 px-4">
      <EmptyState
        title="Your inbox is empty"
        description={
          isAdmin
            ? 'When users submit feedback, report problems, or send support messages, they will appear here for your team to review.'
            : 'Job updates, support replies, and platform announcements will appear here as activity picks up.'
        }
        action={
          isAdmin ? (
            <button type="button" onClick={onCreateTest} className={BTN_PRIMARY}>
              Compose test message
            </button>
          ) : (
            <button type="button" onClick={onContactSupport} className={BTN_PRIMARY}>
              Contact support
            </button>
          )
        }
      />
    </div>
  );
}
