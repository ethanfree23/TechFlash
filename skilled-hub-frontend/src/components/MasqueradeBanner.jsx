import React from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../auth';

/**
 * Shown while an admin is masquerading as another user; restores admin JWT from sessionStorage on exit.
 */
export default function MasqueradeBanner() {
  const navigate = useNavigate();

  if (!auth.isMasquerading()) return null;

  const user = auth.getUser();

  const exit = () => {
    auth.exitMasquerade();
    window.location.assign('/admin/users');
  };

  return (
    <div className="sticky top-0 z-[200] border-b border-amber-700 bg-amber-500 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          <span className="uppercase tracking-wide text-amber-100 mr-2">Masquerade</span>
          Acting as <span className="font-semibold">{user?.email || 'user'}</span>
          <span className="text-amber-100 capitalize ml-2">({user?.role})</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/15 hover:bg-white/25 border border-white/30"
          >
            Dashboard
          </button>
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
