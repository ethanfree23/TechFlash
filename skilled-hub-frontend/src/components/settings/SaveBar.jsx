import React from 'react';

export default function SaveBar({ dirty, saving, onSave, onDiscard, saveLabel = 'Save changes' }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 shadow-sm backdrop-blur-sm">
      <span className="text-xs font-medium text-amber-900 mr-auto">Unsaved changes</span>
      {onDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Discard
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : saveLabel}
      </button>
    </div>
  );
}
