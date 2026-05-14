import React from 'react';

/**
 * Outer layout for Settings: gray canvas + constrained main width.
 */
export default function SettingsPageShell({ children, wide = false, className = '' }) {
  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      <div
        className={`mx-auto w-full px-4 py-6 sm:py-8 ${
          wide ? 'max-w-7xl' : 'max-w-3xl'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
