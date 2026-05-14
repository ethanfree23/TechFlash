import React from 'react';

export default function LoadingSkeleton({ className = '' }) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`} aria-hidden>
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-24 bg-gray-100 rounded-xl" />
    </div>
  );
}
