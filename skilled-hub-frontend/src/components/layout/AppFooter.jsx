import React from 'react';
import { Link } from 'react-router-dom';

export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500 sm:px-6 sm:pt-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <span>{`© ${year} TechFlash`}</span>
          <a href="/terms-of-service/" className="hover:text-[#3A7CA5]">
            Terms of Service
          </a>
          <a href="/privacy-policy/" className="hover:text-[#3A7CA5]">
            Privacy Policy
          </a>
          <Link to="/legal" className="hover:text-[#3A7CA5]">
            Legal
          </Link>
        </div>
        <div className="mt-2 space-y-1 text-gray-600">
          <p className="font-medium">TechFlash is operated by TECHFLASH INC.</p>
          <p>TECHFLASH INC. d/b/a TechFlash</p>
          <p>8012 Ravenswood Rd, Granbury, TX 76049 USA</p>
          <p>
            <a href="mailto:admin@techflash.app" className="hover:text-[#3A7CA5]">
              admin@techflash.app
            </a>{' '}
            |{' '}
            <a href="tel:+18326213956" className="hover:text-[#3A7CA5]">
              832-621-3956
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
