import React from 'react';

function SkeletonRow() {
  return (
    <div className="px-4 py-3.5 border-b border-gray-100 animate-pulse" aria-hidden>
      <div className="flex gap-2 mb-2">
        <div className="h-4 w-14 bg-gray-200 rounded-full" />
        <div className="h-4 w-12 bg-gray-200 rounded-full" />
      </div>
      <div className="h-4 w-3/4 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-1/2 bg-gray-100 rounded mb-2" />
      <div className="h-3 w-full bg-gray-100 rounded" />
    </div>
  );
}

export default function MessagesLoadingSkeleton() {
  return (
    <div className="py-1" role="status" aria-label="Loading messages">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
