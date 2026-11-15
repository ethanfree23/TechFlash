import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  FaBars,
  FaBriefcase,
  FaBuilding,
  FaChevronDown,
  FaClipboardCheck,
  FaClipboardList,
  FaCog,
  FaComments,
  FaHardHat,
  FaHome,
  FaBalanceScale,
  FaMoneyCheckAlt,
  FaPaperPlane,
  FaSignOutAlt,
  FaTimes,
  FaUserShield,
  FaUsers,
} from 'react-icons/fa';
import { TECHFLASH_LOGO_NAV } from '../constants/branding';
import ReferralModal from './ReferralModal';
import { getAppNavItems } from '../utils/appNavItems';

const navInactive =
  'px-3 py-2 font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md whitespace-nowrap shrink-0';
const navActive =
  'px-3 py-2 font-medium text-blue-600 bg-blue-50 rounded-md whitespace-nowrap shrink-0';

const SETTINGS_NESTED_PAGES = ['settings', 'reviews', 'trust_safety', 'assessments', 'job_payments'];

const ADMIN_SETTINGS_ITEMS = [
  { page: 'settings', to: '/settings', label: 'Settings' },
  { page: 'reviews', to: '/admin/reviews', label: 'Reviews' },
  { page: 'job_payments', to: '/admin/job-payments', label: 'Payments' },
  { page: 'trust_safety', to: '/admin/trust-safety', label: 'Trust & Safety' },
  { page: 'assessments', to: '/admin/assessments', label: 'Assessments' },
];

const NAV_ICONS = {
  dashboard: FaHome,
  jobs: FaBriefcase,
  messages: FaComments,
  users: FaUsers,
  technicians: FaHardHat,
  assessments: FaClipboardList,
  admin_assessments: FaClipboardCheck,
  legal: FaBalanceScale,
  settings: FaCog,
  reviews: FaClipboardList,
  job_payments: FaMoneyCheckAlt,
  trust_safety: FaUserShield,
  crm: FaBuilding,
  referral: FaPaperPlane,
  logout: FaSignOutAlt,
};

function SettingsNavMenu({ activePage }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuId = useId();
  const active = SETTINGS_NESTED_PAGES.includes(activePage);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        className={`${active ? navActive : navInactive} inline-flex items-center gap-1`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Settings
        <FaChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[12.5rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {ADMIN_SETTINGS_ITEMS.map((item, index) => (
            <React.Fragment key={item.page}>
              {index === 1 && <div className="my-1 border-t border-gray-100" role="separator" />}
              <Link
                role="menuitem"
                to={item.to}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 text-sm font-medium ${
                  activePage === item.page
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                {item.label}
              </Link>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function DrawerNavLink({ item, active, onNavigate }) {
  const Icon = NAV_ICONS[item.id] || FaCog;
  const isLogout = item.action === 'logout';
  const className = `flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] font-medium transition-colors ${
    active
      ? 'bg-blue-50 text-blue-700'
      : isLogout
        ? 'text-red-600 hover:bg-red-50 active:bg-red-100'
        : 'text-gray-800 hover:bg-gray-50 active:bg-gray-100'
  }`;

  if (item.action === 'referral' || item.action === 'logout') {
    return (
      <button type="button" className={className} onClick={() => onNavigate(item)}>
        <Icon className={`h-4 w-4 shrink-0 ${isLogout ? 'text-red-500' : 'text-gray-500'}`} aria-hidden />
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <Link
      to={item.to}
      data-demo={item.demo}
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(item)}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}

function DrawerSection({ label, items, activePage, onNavigate, className = '' }) {
  if (!items?.length) return null;
  return (
    <div className={className}>
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <DrawerNavLink
            key={item.id}
            item={item}
            active={item.page ? activePage === item.page : false}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function MobileNavDrawer({
  open,
  onClose,
  primary,
  management,
  account,
  accountSectionLabel,
  activePage,
  onNavigate,
  titleId,
}) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const enterId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      const focusId = window.setTimeout(() => closeRef.current?.focus(), 50);
      return () => {
        cancelAnimationFrame(enterId);
        window.clearTimeout(focusId);
        document.body.style.overflow = prevOverflow;
      };
    }

    setEntered(false);
    const hideId = window.setTimeout(() => setVisible(false), 220);
    return () => window.clearTimeout(hideId);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!visible) return null;

  return createPortal(
    <div className="md:hidden" data-testid="mobile-nav-drawer-root">
      <button
        type="button"
        aria-label="Close navigation menu"
        className={`fixed inset-0 z-[200] bg-black/40 transition-opacity duration-200 ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="mobile-nav-drawer"
        className={`fixed inset-y-0 left-0 z-[210] flex w-[min(85vw,320px)] max-w-[320px] flex-col bg-white shadow-2xl transition-transform duration-200 ease-out ${
          entered ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img src={TECHFLASH_LOGO_NAV} alt="" className="h-8 object-contain" />
            <span id={titleId} className="truncate text-base font-semibold text-gray-900">
              Menu
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Close menu"
          >
            <FaTimes className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col" aria-label="Mobile navigation">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            <DrawerSection
              label="Primary"
              items={primary}
              activePage={activePage}
              onNavigate={onNavigate}
            />
            {management?.length > 0 && (
              <>
                <div className="my-3 border-t border-gray-200" role="separator" />
                <DrawerSection
                  label="Management"
                  items={management}
                  activePage={activePage}
                  onNavigate={onNavigate}
                />
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-gray-50/90 px-3 pb-3 pt-2">
            <div className="max-h-[min(45vh,320px)] overflow-y-auto overscroll-contain">
              <DrawerSection
                label={accountSectionLabel || 'Account'}
                items={account}
                activePage={activePage}
                onNavigate={onNavigate}
              />
            </div>
          </div>
        </nav>
      </aside>
    </div>,
    document.body
  );
}

/**
 * @param {'dashboard'|'jobs'|'technicians'|'messages'|'crm'|'users'|'reviews'|'trust_safety'|'assessments'|'settings'|'legal'|'job_payments'|null|undefined} activePage
 * @param {'full'|'minimal'} navPreset — minimal: Dashboard, Jobs, Settings (profile pages)
 * @param {boolean} profileAvatar — letter avatar linking to settings; hidden below md
 * @param {'none'|'welcome'|'simple'|'crm'} emailVariant — right-side user info (not used when profileAvatar)
 */
export default function AppHeader({
  user,
  onLogout,
  activePage: activePageProp,
  currentPage,
  navPreset = 'full',
  profileAvatar = false,
  emailVariant = 'none',
}) {
  const activePage = activePageProp ?? currentPage;
  const location = useLocation();
  const {
    primary,
    management,
    account,
    showCrm,
    canRefer,
    accountSectionLabel,
  } = getAppNavItems(user, navPreset);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerTitleId = useId();

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  };

  // Close drawer after in-app navigation and browser back/forward.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  const handleDrawerNavigate = (item) => {
    if (item.action === 'referral') {
      setShowReferralModal(true);
      closeDrawer();
      return;
    }
    if (item.action === 'logout') {
      closeDrawer();
      onLogout?.();
      return;
    }
    closeDrawer();
  };

  const NavLink = ({ page, to, children, ...rest }) => {
    const active = activePage === page;
    return (
      <Link to={to} className={active ? navActive : navInactive} {...rest}>
        {children}
      </Link>
    );
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 sm:gap-4 h-16 min-w-0 w-full pt-[env(safe-area-inset-top)]">
        <button
          ref={menuButtonRef}
          type="button"
          className="md:hidden inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          data-testid="mobile-nav-menu-button"
          onClick={() => setDrawerOpen(true)}
        >
          <FaBars className="h-5 w-5" aria-hidden />
        </button>

        <Link to="/dashboard" className="shrink-0 flex items-center">
          <img src={TECHFLASH_LOGO_NAV} alt="TechFlash" className="h-9 object-contain" />
        </Link>

        {/* Desktop navigation — unchanged layout, hidden on small screens */}
        <nav
          className="hidden md:flex flex-1 min-w-0 items-center gap-1 sm:gap-2 py-1"
          aria-label="Main navigation"
        >
          <div className="flex min-w-0 items-center gap-1 sm:gap-2 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x">
            <NavLink page="dashboard" to="/dashboard">
              Dashboard
            </NavLink>
            <NavLink page="jobs" to="/jobs" data-demo="jobs-tab">
              Jobs
            </NavLink>
            {navPreset === 'full' && showCrm && (
              <>
                <NavLink page="messages" to="/messages">
                  Messages
                </NavLink>
                <NavLink page="users" to="/admin/users">
                  Users
                </NavLink>
              </>
            )}
            {navPreset === 'full' && !showCrm && (
              <>
                {(user?.role === 'company' || user?.role === 'admin') && (
                  <NavLink page="technicians" to="/technicians">
                    Technicians
                  </NavLink>
                )}
                {user?.role === 'technician' && (
                  <NavLink page="assessments" to="/assessments">
                    Assessments
                  </NavLink>
                )}
                <NavLink page="messages" to="/messages">
                  Messages
                </NavLink>
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
          </div>
          {navPreset === 'full' && showCrm && (
            <>
              <span className="hidden sm:inline text-gray-300 px-0.5 select-none" aria-hidden>
                |
              </span>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <NavLink page="crm" to="/crm">
                  CRM
                </NavLink>
                <SettingsNavMenu activePage={activePage} />
              </div>
            </>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {canRefer && (
            <button
              type="button"
              onClick={() => setShowReferralModal(true)}
              className="hidden md:inline-flex px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 whitespace-nowrap"
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
            <span className="hidden md:inline text-xs text-gray-500 capitalize">{user?.role}</span>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="hidden md:inline-flex px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap shrink-0"
          >
            Logout
          </button>
        </div>
      </div>

      <MobileNavDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        primary={primary}
        management={management}
        account={account}
        accountSectionLabel={accountSectionLabel}
        activePage={activePage}
        onNavigate={handleDrawerNavigate}
        titleId={drawerTitleId}
      />

      <ReferralModal isOpen={showReferralModal} onClose={() => setShowReferralModal(false)} />
    </header>
  );
}
