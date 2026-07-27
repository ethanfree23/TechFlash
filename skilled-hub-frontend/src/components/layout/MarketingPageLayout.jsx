import React from 'react';
import { MarketingHeader } from '../marketing/MarketingHeader';
import MarketingFooter from '../marketing/MarketingFooter';

export default function MarketingPageLayout({ children, footerVariant = 'default', className = 'bg-white' }) {
  return (
    <div className={`min-h-screen min-w-0 text-gray-800 ${className}`}>
      <div className="flex min-h-screen flex-col">
        <MarketingHeader />
        <main className="flex-1 pb-14 sm:pb-16">{children}</main>
        <MarketingFooter variant={footerVariant} />
      </div>
    </div>
  );
}
