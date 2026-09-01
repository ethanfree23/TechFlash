import React from 'react';
import { auth } from '../auth';
import { isDemoMode, withDemoPath } from '../utils/demoMode';

function masqueradeDisplayUser() {
  const current = auth.getUser();
  if (current && String(current.role || '').toLowerCase() !== 'admin') return current;
  const snap = auth.getMasqueradeTargetUser();
  if (snap && String(snap.role || '').toLowerCase() !== 'admin') return snap;
  return null;
}

/**
 * Shown while an admin is masquerading as another user; restores admin JWT from sessionStorage on exit.
 */
export default function MasqueradeBanner() {
  if (!auth.isMasquerading()) return null;

  const user = masqueradeDisplayUser();

  const exit = () => {
    const restored = auth.exitMasquerade();
    if (!restored) {
      window.location.assign(isDemoMode() ? withDemoPath('/login') : '/login');
      return;
    }
    window.location.assign(isDemoMode() ? withDemoPath('/settings?tab=account') : '/admin/users');
  };

  return (
    <div className="sticky top-0 z-[200] border-b border-amber-700 bg-amber-500 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          <span className="uppercase tracking-wide text-amber-100 mr-2">Masquerade</span>
          Acting as <span className="font-semibold">{user?.email || 'user'}</span>
          {user?.role ? (
            <span className="text-amber-100 capitalize ml-2">({user.role})</span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exit}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-amber-800 hover:bg-amber-50 border border-white"
          >
            Exit masquerade
          </button>
        </div>
      </div>
    </div>
  );
}
