import React from 'react';

export function SignupWizardShell({ children }) {
  return (
    <div className="relative -mt-4 rounded-3xl border border-gray-200/80 bg-white shadow-xl shadow-gray-900/5">
      <div className="p-6 sm:p-8 lg:p-10">{children}</div>
    </div>
  );
}
