import React from 'react';
import { FaCheck } from 'react-icons/fa';

const lines = ['Built for Trades', 'Clear Job Details', 'Claim-Based Workflow', 'Organized Completion & Payment'];

export function WhyTechFlashTrustFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl min-w-0 grid-cols-1 gap-3 text-center text-sm font-semibold text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
        {lines.map((line) => (
          <span key={line} className="inline-flex items-center justify-center gap-2">
            <FaCheck className="h-3.5 w-3.5 shrink-0 text-tf-orange" aria-hidden />
            {line}
          </span>
        ))}
      </div>
    </footer>
  );
}
