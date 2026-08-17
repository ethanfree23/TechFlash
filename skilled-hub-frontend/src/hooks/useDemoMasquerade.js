import { useState, useEffect, useCallback } from 'react';
import { adminUsersAPI } from '../api/api';
import { auth } from '../auth';
import { DEMO_ACCOUNTS } from '../constants/demoAccounts';
import { withDemoPath } from '../utils/demoMode';

function normalizeDemoAccounts(payload) {
  const accounts = payload?.accounts || {};
  const missingRoles = Array.isArray(payload?.missing_roles) ? payload.missing_roles : [];
  return {
    accounts: {
      admin: accounts.admin || null,
      company: accounts.company || null,
      technician: accounts.technician || null,
    },
    missingRoles,
  };
}

export default function useDemoMasquerade() {
  const [ids, setIds] = useState({});
  const [busy, setBusy] = useState(null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [error, setError] = useState(null);

  const refreshTargets = useCallback(async () => {
    if (auth.getUserRole() !== 'admin') return { ids: {}, missingRoles: [] };
    setLoadingTargets(true);
    try {
      const payload = await adminUsersAPI.demoAccounts();
      const { accounts, missingRoles } = normalizeDemoAccounts(payload);
      const nextIds = {
        admin: accounts.admin?.id || null,
        company: accounts.company?.id || null,
        technician: accounts.technician?.id || null,
      };
      setIds(nextIds);
      return { ids: nextIds, missingRoles };
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resolved = await refreshTargets();
        if (!cancelled) setIds(resolved.ids);
      } catch {
        /* lookup optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTargets]);

  const masqueradeAs = useCallback(
    async (role) => {
      setBusy(role);
      setError(null);
      try {
        const { ids: resolvedIds, missingRoles } = await refreshTargets();
        const id = resolvedIds[role];
        if (!id) {
          const roleLabel = DEMO_ACCOUNTS[role]?.label || role;
          const missingMsg = missingRoles.includes(role)
            ? `${roleLabel} is missing. Run Demo Reset in Settings and try again.`
            : `Could not find ${roleLabel}. Reset demo data and try again.`;
          setError(missingMsg);
          return false;
        }
        const targetId = auth.coerceTargetUserId(id);
        if (!targetId) {
          setError(`Could not find ${DEMO_ACCOUNTS[role]?.label || role}. Reset demo data and try again.`);
          return false;
        }
        const res = await adminUsersAPI.masqueradeStart(targetId);
        if (!res?.token || !res?.user) throw new Error('Invalid masquerade response');
        if (!auth.enterMasquerade(res.token, res.user)) {
          throw new Error('Could not switch user.');
        }
        window.location.replace(withDemoPath('/settings?tab=account'));
        return true;
      } catch (e) {
        setError(e.message || 'Could not switch user.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refreshTargets]
  );

  const returnToAdmin = useCallback(() => {
    setBusy('admin');
    setError(null);
    const restored = auth.exitMasquerade();
    if (!restored) {
      setBusy(null);
      setError('Admin session backup is missing. Please sign in again.');
      window.location.assign(withDemoPath('/login'));
      return false;
    }
    setBusy(null);
    window.location.assign(withDemoPath('/settings?tab=account'));
    return true;
  }, []);

  return {
    ids,
    busy,
    loadingTargets,
    error,
    clearError: () => setError(null),
    masqueradeAs,
    returnToAdmin,
    refreshTargets,
  };
}
