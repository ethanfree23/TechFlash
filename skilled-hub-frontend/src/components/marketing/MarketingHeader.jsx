import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TECHFLASH_LOGO_ICON, TECHFLASH_LOGO_NAV } from '../../constants/branding';
import { FaBars, FaTimes } from 'react-icons/fa';

const baseNav =
  'text-sm font-semibold whitespace-nowrap transition border-b-2 border-transparent pb-0.5';

function navClass(active) {
  if (active) return `${baseNav} text-tf-navy border-tf-orange`;
  return `${baseNav} text-tf-navy/80 hover:text-tf-orange`;
}

export function MarketingHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const isCompaniesLanding = pathname === '/for-companies';
  const isTechniciansLanding = pathname === '/for-technicians';
  const isHowItWorksLanding = pathname === '/how-it-works';
  const isWhyTechFlashLanding = pathname === '/why-techflash';

  const whyTechFlashNav = isWhyTechFlashLanding ? (
    <a href="#why-exists" className={navClass(true)} onClick={close}>
      Why TechFlash
    </a>
  ) : (
    <Link to="/why-techflash" className={navClass(false)} onClick={close}>
      Why TechFlash
    </Link>
  );

  const howItWorksNav = isHowItWorksLanding ? (
    <a href="#marketplace-timeline" className={navClass(true)} onClick={close}>
      How It Works
    </a>
  ) : (
    <Link to="/how-it-works" className={navClass(false)} onClick={close}>
      How It Works
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/90 backdrop-blur-md shadow-sm">
      <div className="relative mx-auto flex h-16 max-w-7xl min-w-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Mobile: logo-only, centered, larger */}
        <Link
          to="/"
          className="absolute left-1/2 top-1/2 z-0 flex -translate-x-1/2 -translate-y-1/2 items-center lg:hidden"
          onClick={close}
          aria-label="TechFlash"
        >
          <img
            src={TECHFLASH_LOGO_ICON}
            alt=""
            className="h-14 w-auto object-contain"
          />
        </Link>

        {/* Desktop: logo + wordmark */}
        <Link to="/" className="group hidden shrink-0 items-center gap-2 lg:flex" onClick={close}>
          <img
            src={TECHFLASH_LOGO_NAV}
            alt="TechFlash"
            className="h-9 transition-transform group-hover:scale-105"
          />
          <span className="text-xl font-bold tracking-tight text-tf-navy">TechFlash</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 lg:flex xl:gap-8">
          <Link to="/for-companies" className={navClass(isCompaniesLanding)} onClick={close}>
            For Companies
          </Link>
          <Link to="/for-technicians" className={navClass(isTechniciansLanding)} onClick={close}>
            For Technicians
          </Link>
          {howItWorksNav}
          {whyTechFlashNav}
          <Link to="/download" className={navClass(false)} onClick={close}>
            Get the app
          </Link>
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <Link to="/login" className={navClass(false)} onClick={close}>
            Sign In
          </Link>
          <Link
            to="/login?tab=signup"
            className="rounded-xl bg-tf-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-tf-orange-hover"
            onClick={close}
          >
            Get Started
          </Link>
        </div>

        <div className="relative z-10 ml-auto flex items-center lg:hidden">
          <button
            type="button"
            className="rounded-lg p-2 text-tf-navy hover:bg-gray-100"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <FaTimes className="h-5 w-5" /> : <FaBars className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-white px-4 py-4 lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            <Link
              to="/for-companies"
              className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tf-navy hover:bg-gray-50"
              onClick={close}
            >
              For Companies
            </Link>
            <Link
              to="/for-technicians"
              className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tf-navy hover:bg-gray-50"
              onClick={close}
            >
              For Technicians
            </Link>
            {isHowItWorksLanding ? (
              <a
                href="#marketplace-timeline"
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tf-navy hover:bg-gray-50"
                onClick={close}
              >
                How It Works
              </a>
            ) : (
              <Link
                to="/how-it-works"
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tf-navy hover:bg-gray-50"
                onClick={close}
              >
                How It Works
              </Link>
            )}
            {isWhyTechFlashLanding ? (
              <a
                href="#why-exists"
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tf-navy hover:bg-gray-50"
                onClick={close}
              >
                Why TechFlash
              </a>
            ) : (
              <Link
                to="/why-techflash"
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tf-navy hover:bg-gray-50"
                onClick={close}
              >
                Why TechFlash
              </Link>
            )}
            <Link to="/download" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tf-navy hover:bg-gray-50" onClick={close}>
              Get the app
            </Link>
            <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-3">
              <Link
                to="/login"
                className="rounded-lg px-3 py-2.5 text-center text-sm font-semibold text-tf-navy hover:bg-gray-50"
                onClick={close}
              >
                Sign In
              </Link>
              <Link
                to="/login?tab=signup"
                className="rounded-xl bg-tf-orange px-3 py-2.5 text-center text-sm font-semibold text-white"
                onClick={close}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
