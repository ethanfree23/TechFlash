import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaCog, FaDownload, FaEllipsisH, FaEnvelope, FaFilter, FaSearch, FaTimes, FaUserPlus } from 'react-icons/fa';

export default function UsersHeader({ onCreateUser, onInviteUser, onExport, onRefresh, onClearFilters }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const btnSecondary =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200/90 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm';

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Users</h1>
        <p className="text-xs text-slate-500 mt-0.5 max-w-xl leading-relaxed">
          Manage technicians, companies, verification, activity, and platform risk.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        <button type="button" onClick={onCreateUser} className={`${btnSecondary} bg-tf-blue text-white border-tf-blue hover:bg-tf-blue-dark hover:border-tf-blue-dark`}>
          <FaUserPlus className="w-3 h-3" aria-hidden />
          Create
        </button>
        <button type="button" onClick={onInviteUser} className={btnSecondary}>
          <FaEnvelope className="w-3 h-3" aria-hidden />
          Invite
        </button>
        <button type="button" onClick={onExport} className={btnSecondary}>
          <FaDownload className="w-3 h-3" aria-hidden />
          Export
        </button>
        <div className="relative" ref={menuRef}>
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className={btnSecondary} aria-expanded={menuOpen}>
            <FaEllipsisH className="w-3 h-3" aria-hidden />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-xs">
              <button type="button" onClick={() => { onRefresh?.(); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                Refresh list
              </button>
              <button type="button" onClick={() => { onClearFilters?.(); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                Clear all filters
              </button>
              <Link to="/" onClick={() => setMenuOpen(false)} className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                Command center
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
