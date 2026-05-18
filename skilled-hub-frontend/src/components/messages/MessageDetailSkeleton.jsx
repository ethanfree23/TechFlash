import React from 'react';

export default function MessageDetailSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse" aria-busy="true" aria-label="Loading conversation">
      <div className="flex gap-2">
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
        <div className="h-5 w-14 bg-gray-200 rounded-full" />
        <div className="h-5 w-16 bg-gray-200 rounded-full ml-auto" />
      </div>
      <div className="h-6 w-3/4 bg-gray-200 rounded" />
      <div className="h-4 w-1/3 bg-gray-100 rounded" />
      <div className="space-y-3 pt-4">
        <div className="h-24 bg-gray-100 rounded-xl" />
        <div className="h-20 bg-gray-100 rounded-xl" />
      </div>
    </div>
  );
}
