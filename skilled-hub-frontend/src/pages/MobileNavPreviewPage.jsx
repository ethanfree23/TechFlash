import React, { useState } from 'react';
import AppHeader from '../components/AppHeader';

const USERS = {
  technician: { id: 1, role: 'technician', email: 'tech@example.com' },
  company: { id: 2, role: 'company', email: 'company@example.com' },
  admin: { id: 3, role: 'admin', email: 'admin@techflash.app' },
};

/**
 * Dev-only harness for visual QA of the mobile navigation drawer.
 * Mounted only when import.meta.env.DEV is true.
 */
export default function MobileNavPreviewPage() {
  const [role, setRole] = useState('technician');
  const [activePage, setActivePage] = useState('dashboard');
  const [logoutCount, setLogoutCount] = useState(0);
  const user = USERS[role];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        user={user}
        onLogout={() => setLogoutCount((n) => n + 1)}
        activePage={activePage}
        emailVariant="welcome"
      />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Dev preview</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Mobile navigation drawer</h1>
        <p className="mt-2 text-sm text-slate-600">
          Resize below the <code className="rounded bg-slate-100 px-1">md</code> breakpoint (or use
          device mode) to exercise the hamburger menu. Desktop navigation stays unchanged at{' '}
          <code className="rounded bg-slate-100 px-1">md+</code>.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {Object.keys(USERS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRole(key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${
                role === key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Active page
          <select
            className="mt-1 block w-full max-w-xs rounded-md border-gray-300 text-sm"
            value={activePage}
            onChange={(e) => setActivePage(e.target.value)}
          >
            {[
              'dashboard',
              'jobs',
              'messages',
              'assessments',
              'technicians',
              'settings',
              'crm',
              'users',
              'reviews',
              'job_payments',
              'trust_safety',
              'legal',
            ].map((page) => (
              <option key={page} value={page}>
                {page}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-4 text-sm text-slate-500">Logout clicks: {logoutCount}</p>
        <div className="mt-8 h-[120vh] rounded-xl border border-dashed border-gray-300 bg-white/60 p-4 text-sm text-gray-500">
          Tall page content — confirm background scroll locks while the drawer is open.
        </div>
      </main>
    </div>
  );
}
