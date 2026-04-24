import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TECHFLASH_LOGO_NAV } from '../constants/branding';
import ReferralModal from './ReferralModal';

const navInactive =
  'px-3 py-2 font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md whitespace-nowrap shrink-0';
const navActive =
  'px-3 py-2 font-medium text-blue-600 bg-blue-50 rounded-md whitespace-nowrap shrink-0';

/**
 * @param {'dashboard'|'jobs'|'messages'|'crm'|'users'|'settings'|'legal'|null|undefined} activePage
 * @param {'full'|'minimal'} navPreset — minimal: Dashboard, Jobs, Settings (profile pages)
 * @param {boolean} profileAvatar — letter avatar linking to settings; hidden below md
 * @param {'none'|'welcome'|'simple'|'crm'} emailVariant — right-side user info (not used when profileAvatar)
 */
export default function AppHeader({
  user,
  onLogout,
  activePage,
  navPreset = 'full',
  profileAvatar = false,
  emailVariant = 'none',
}) {
  const isAdmin = user?.role === 'admin';
  const showCrm = navPreset === 'full' && isAdmin;
  const [showReferralModal, setShowReferralModal] = useState(false);
  const canRefer = user?.role === 'company' || user?.role === 'technician';

  const NavLink = ({ page, to, children }) => {
    const active = activePage === page;
    return (
      <Link to={to} className={active ? navActive : navInactive}>
        {children}
      </Link>
    );
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 sm:gap-4 h-16 min-w-0 w-full">
        <Link to="/dashboard" className="shrink-0 flex items-center">
          <img src={TECHFLASH_LOGO_NAV} alt="TechFlash" className="h-9 object-contain" />
        </Link>
        <nav
          className="flex flex-1 min-w-0 items-center gap-1 sm:gap-2 overflow-x-auto overflow-y-hidden py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x"
          aria-label="Main navigation"
        >
          <NavLink page="dashboard" to="/dashboard">
            Dashboard
          </NavLink>
          <NavLink page="jobs" to="/jobs">
            Jobs
          </NavLink>
          {navPreset === 'full' && (
            <>
              <NavLink page="messages" to="/messages">
                Messages
              </NavLink>
              {showCrm && (
                <>
                  <NavLink page="crm" to="/crm">
                    CRM
                  </NavLink>
                  <NavLink page="users" to="/admin/users">
                    Users
                  </NavLink>
                </>
              )}
              <NavLink page="settings" to="/settings">
                Settings
              </NavLink>
              <NavLink page="legal" to="/legal">
                Legal
              </NavLink>
            </>
          )}
          {navPreset === 'minimal' && (
            <>
              <NavLink page="settings" to="/settings">
                Settings
              </NavLink>
              <NavLink page="legal" to="/legal">
                Legal
              </NavLink>
            </>
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {canRefer && (
            <button
              type="button"
              onClick={() => setShowReferralModal(true)}
              className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 whitespace-nowrap"
            >
              Send Referral
            </button>
          )}
          {profileAvatar && (
            <Link
              to="/settings"
              className="hidden md:flex items-center hover:opacity-80"
              title="Settings"
            >
              <div className="bg-gray-200 rounded-full w-8 h-8 items-center justify-center text-gray-600 font-bold flex">
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
            </Link>
          )}
          {!profileAvatar && emailVariant === 'welcome' && (
            <>
              <span className="hidden md:inline text-sm text-gray-600">
                Welcome, <span className="font-medium">{user?.email}</span>
                <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full capitalize">
                  {user?.role}
                </span>
              </span>
              <span className="md:hidden px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full capitalize">
                {user?.role}
              </span>
            </>
          )}
          {!profileAvatar && emailVariant === 'simple' && (
            <span
              className="hidden sm:inline max-w-[11rem] md:max-w-none truncate text-sm text-gray-600"
              title={user?.email}
            >
              {user?.email}
            </span>
          )}
          {!profileAvatar && emailVariant === 'crm' && (
            <>
              <span className="hidden sm:inline text-sm text-gray-600">
                <span className="font-medium">{user?.email}</span>
                <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full capitalize">
                  {user?.role}
                </span>
              </span>
              <span className="sm:hidden px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full capitalize">
                {user?.role}
              </span>
            </>
          )}
          {profileAvatar && (
            <span className="text-xs text-gray-500 capitalize">{user?.role}</span>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap shrink-0"
          >
            Logout
          </button>
        </div>
      </div>
      <ReferralModal isOpen={showReferralModal} onClose={() => setShowReferralModal(false)} />
    </header>
  );
}
