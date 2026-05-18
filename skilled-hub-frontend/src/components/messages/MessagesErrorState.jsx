import React from 'react';
import { BTN_PRIMARY } from './messagesUi';

export default function MessagesErrorState({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900">Unable to load messages</h3>
      <p className="mt-2 text-sm text-gray-500 max-w-xs">
        We could not reach the server. Your inbox may be out of date until the connection is restored.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        <button type="button" onClick={onRetry} className={BTN_PRIMARY}>
          Try again
        </button>
      </div>
    </div>
  );
}
