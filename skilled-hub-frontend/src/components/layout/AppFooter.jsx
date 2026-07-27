import React from 'react';
import { Link } from 'react-router-dom';

export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500 sm:px-6 sm:pt-4 lg:px-8">
        <span>{`© ${year} TechFlash`}</span>
        <Link to="/terms-of-service" className="hover:text-[#3A7CA5]">
          Terms
        </Link>
        <Link to="/privacy-policy" className="hover:text-[#3A7CA5]">
          Privacy
        </Link>
        <Link to="/legal" className="hover:text-[#3A7CA5]">
          Legal
        </Link>
      </div>
    </footer>
  );
}
