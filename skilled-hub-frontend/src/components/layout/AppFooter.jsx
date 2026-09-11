import React from 'react';
import { Link } from 'react-router-dom';

export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs leading-5 text-gray-500 sm:px-6 lg:px-8">
        <p>
          <span>{`© ${year} TechFlash`}</span>
          <span className="mx-2 text-gray-300" aria-hidden>
            ·
          </span>
          <a href="/terms-of-service/" className="hover:text-[#3A7CA5]">
            Terms of Service
          </a>
          <span className="mx-2 text-gray-300" aria-hidden>
            ·
          </span>
          <a href="/privacy-policy/" className="hover:text-[#3A7CA5]">
            Privacy Policy
          </a>
          <span className="mx-2 text-gray-300" aria-hidden>
            ·
          </span>
          <Link to="/legal" className="hover:text-[#3A7CA5]">
            Legal
          </Link>
        </p>
        <p className="mt-1 text-gray-600">
          TechFlash is operated by TECHFLASH INC. d/b/a TechFlash
          <span className="mx-2 text-gray-300" aria-hidden>
            ·
          </span>
          8012 Ravenswood Rd, Granbury, TX 76049 USA
          <span className="mx-2 text-gray-300" aria-hidden>
            ·
          </span>
          <a href="mailto:admin@techflash.app" className="hover:text-[#3A7CA5]">
            admin@techflash.app
          </a>
          <span className="mx-2 text-gray-300" aria-hidden>
            ·
          </span>
          <a href="tel:+18326213956" className="hover:text-[#3A7CA5]">
            832-621-3956
          </a>
        </p>
      </div>
    </footer>
  );
}
