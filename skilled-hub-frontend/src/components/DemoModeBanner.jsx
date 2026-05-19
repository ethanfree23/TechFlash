import React, { useState } from 'react';
import { isDemoMode, isDemoBannerDismissed, dismissDemoBanner } from '../utils/demoMode';

export default function DemoModeBanner() {
  const [dismissed, setDismissed] = useState(() => isDemoBannerDismissed());

  if (!isDemoMode() || dismissed) return null;

  return (
    <div
      className="sticky top-0 z-[199] border-b border-indigo-200/80 bg-gradient-to-r from-slate-900 to-indigo-950 px-4 py-2 text-center text-sm text-white"
      role="status"
    >
      <span className="font-semibold">Demo sandbox</span>
      <span className="mx-2 text-indigo-300/80">·</span>
      <span className="text-indigo-100/90">
        Sample marketplace data only — no real emails, SMS, or payment charges.
      </span>
      <button
        type="button"
        onClick={() => {
          dismissDemoBanner();
          setDismissed(true);
        }}
        className="ml-3 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/15"
      >
        Dismiss
      </button>
    </div>
  );
}
