import { useState, useEffect, useCallback } from 'react';
import { adminUsersAPI } from '../api/api';
import { auth } from '../auth';
import { DEMO_ACCOUNTS } from '../constants/demoAccounts';
import { withDemoPath } from '../utils/demoMode';

async function resolveDemoUserId(email) {
  const rows = await adminUsersAPI.list({ q: email });
  const list = Array.isArray(rows) ? rows : rows?.users || [];
  const match = list.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  return match?.id || null;
}

export default function useDemoMasquerade() {
  const [ids, setIds] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (auth.getUserRole() !== 'admin') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [companyId, techId] = await Promise.all([
          resolveDemoUserId(DEMO_ACCOUNTS.company.email),
          resolveDemoUserId(DEMO_ACCOUNTS.technician.email),
        ]);
        if (!cancelled) setIds({ company: companyId, technician: techId });
      } catch {
        /* lookup optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const masqueradeAs = useCallback(
    async (role) => {
      const id = ids[role];
      if (!id) {
        setError(`Could not find ${DEMO_ACCOUNTS[role]?.label || role}. Reset demo data and try again.`);
        return false;
      }
      setBusy(role);
      setError(null);
      try {
        const res = await adminUsersAPI.masqueradeStart(id);
        auth.enterMasquerade(res.token, res.user);
        window.location.assign(withDemoPath('/settings?tab=account'));
        return true;
      } catch (e) {
        setError(e.message || 'Could not switch user.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [ids]
  );

  const returnToAdmin = useCallback(() => {
    auth.exitMasquerade();
    window.location.assign(withDemoPath('/settings?tab=account'));
  }, []);

  return { ids, busy, error, clearError: () => setError(null), masqueradeAs, returnToAdmin };
}
