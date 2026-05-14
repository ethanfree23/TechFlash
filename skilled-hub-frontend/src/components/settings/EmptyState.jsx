import React from 'react';

export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
