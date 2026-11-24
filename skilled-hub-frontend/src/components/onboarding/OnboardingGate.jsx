import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../../auth';
import { technicianOnboardingAPI } from '../../api/technicianOnboardingApi';

const ALLOWED_PREFIXES = [
  '/technician/onboarding',
  '/login',
  '/reset-password',
  '/create-password',
  '/legal',
  '/terms-of-service',
  '/privacy-policy',
  '/cookie-policy',
  '/payment-terms',
  '/dmca-ip-policy',
  '/references/respond',
  '/download',
];

function pathAllowed(pathname, search) {
  if (ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Stripe / Checkr return into onboarding with query params
  if (pathname.startsWith('/technician/onboarding')) return true;
  // Settings deep-links used mid-onboarding for Stripe callbacks that still land on settings
  if (pathname === '/settings' && /connect=|membership=/.test(search || '')) return true;
  return false;
}

/**
 * Redirects technicians with incomplete guided onboarding to the wizard.
 * No-ops when the feature flag is off, user is not a technician, or onboarding is complete.
 */
export default function OnboardingGate({ user, children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, required: false, checked: false });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const current = user || auth.getUser();
      if (!current || current.role !== 'technician') {
        if (!cancelled) setState({ loading: false, required: false, checked: true });
        return;
      }

      // Prefer login payload when present to avoid a flash; still refresh from API.
      const cached = current.guided_onboarding;
      if (cached && cached.feature_enabled === false) {
        if (!cancelled) setState({ loading: false, required: false, checked: true });
        return;
      }
      if (cached && cached.required === false && cached.status === 'completed') {
        if (!cancelled) setState({ loading: false, required: false, checked: true });
        // Still verify in background below.
      }

      try {
        const progress = await technicianOnboardingAPI.get();
        if (cancelled) return;
        const required = !!(progress?.feature_enabled && progress?.required);
        // Keep a light cache on the auth user for subsequent navigations.
        const nextUser = {
          ...current,
          guided_onboarding: {
            applicable: true,
            feature_enabled: !!progress?.feature_enabled,
            required,
            status: progress?.status,
            percent: progress?.percent,
            current_section: progress?.current_section,
          },
        };
        auth.setUser(nextUser);
        setState({ loading: false, required, checked: true });
      } catch {
        if (!cancelled) {
          // Fail open to avoid locking technicians out if the endpoint errors.
          setState({ loading: false, required: false, checked: true });
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, location.pathname]);

  if (!user || user.role !== 'technician') return children;

  if (pathAllowed(location.pathname, location.search)) return children;

  if (state.loading && !state.checked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-tf-orange border-t-transparent" />
          <p className="text-sm text-slate-600">Checking account setup…</p>
        </div>
      </div>
    );
  }

  if (state.required) {
    return <Navigate to="/technician/onboarding" replace state={{ from: location.pathname }} />;
  }

  return children;
}
