import React from 'react';
import { BTN_SECONDARY } from './messagesUi';

export default function MessagesFilteredEmpty({ onClearFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900">No matching messages</h3>
      <p className="mt-1.5 text-sm text-gray-500 max-w-xs">
        Try adjusting your search or filters to find what you are looking for.
      </p>
      {onClearFilters && (
        <button type="button" onClick={onClearFilters} className={`mt-4 ${BTN_SECONDARY}`}>
          Clear filters
        </button>
      )}
    </div>
  );
}
