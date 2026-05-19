import React, { useState, useCallback } from 'react';
import { FaExternalLinkAlt, FaCopy } from 'react-icons/fa';
import { auth } from '../../auth';
import { isDemoMode, getDemoAppUrl } from '../../utils/demoMode';
import { DEMO_ACCOUNTS } from '../../constants/demoAccounts';
import useDemoMasquerade from '../../hooks/useDemoMasquerade';
import DemoResetButton from '../demo/DemoResetButton';
import AlertModal from '../AlertModal';

function CredentialRow({ account }) {
  const [copied, setCopied] = useState(null);

  const copy = useCallback(async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied('error');
    }
  }, []);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5">
      <p className="text-xs font-semibold text-gray-800">{account.label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="font-mono">{account.email}</span>
        <button
          type="button"
          onClick={() => copy(account.email, `${account.label}-email`)}
          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-gray-50"
        >
          <FaCopy className="text-[9px]" />
          {copied === `${account.label}-email` ? 'Copied' : 'Copy email'}
        </button>
      </div>
    </div>
  );
}

function SwitchRoleButton({ active, busy, disabled, onClick, children, demoTarget }) {
  return (
    <button
      type="button"
      data-demo={demoTarget}
      disabled={disabled || busy}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:opacity-50 ${
        active
          ? 'border-blue-300 bg-blue-50 text-blue-950'
          : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <span className="font-medium">{children}</span>
      {active ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Current</span>
      ) : busy ? (
        <span className="text-xs text-gray-500">Switching…</span>
      ) : (
        <span className="text-xs text-gray-500">Switch</span>
      )}
    </button>
  );
}

export default function AccountRolePanel({ roleLabel }) {
  const masquerading = auth.isMasquerading();
  const isAdmin = auth.isAdmin();
  const isDemo = isDemoMode();
  const demoEntryUrl = (path) => getDemoAppUrl(path);
  const { busy, error, clearError, masqueradeAs, returnToAdmin } = useDemoMasquerade();
  const [prodAlert, setProdAlert] = useState(null);

  const showDemoSwitcher = isDemo && (isAdmin || masquerading);
  const showProdDemoLinks = isAdmin && !isDemo && !masquerading;

  if (!showDemoSwitcher && !showProdDemoLinks) {
    return null;
  }

  const openDemo = () => {
    window.open(demoEntryUrl('/login'), '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div
        data-demo="account-role-switcher"
        className="mt-4 space-y-3 border-t border-gray-100 pt-4"
      >
        {masquerading && (
          <>
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 leading-relaxed">
              You are previewing the app as <span className="font-semibold">{auth.getUser()?.email}</span> (
              {roleLabel}). Switch back to admin when you are done.
            </p>
            <button
              type="button"
              onClick={returnToAdmin}
              className="w-full rounded-xl border border-amber-300 bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Return to Demo Admin
            </button>
          </>
        )}

        {isAdmin && !masquerading && isDemo && (
          <>
            <p className="text-sm text-gray-600 leading-relaxed">
              Preview the marketplace as a demo company or technician. Your admin session is saved — switch back
              from here or the banner at the top.
            </p>
            <SwitchRoleButton active disabled busy={false}>
              Demo Admin
            </SwitchRoleButton>
            <SwitchRoleButton
              busy={busy === 'company'}
              onClick={() => masqueradeAs('company')}
              demoTarget="masquerade-company"
            >
              Bayou City Mechanical (Company)
            </SwitchRoleButton>
            <SwitchRoleButton busy={busy === 'technician'} onClick={() => masqueradeAs('technician')}>
              Marcus Alvarez (Technician)
            </SwitchRoleButton>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Between walkthroughs</p>
              <DemoResetButton variant="settings" />
            </div>
          </>
        )}

        {showProdDemoLinks && (
          <>
            <p className="text-sm text-gray-600 leading-relaxed">
              Open the isolated demo workspace with marketplace data across Houston, Austin, and Dallas.
            </p>
            <button
              type="button"
              onClick={openDemo}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Open demo environment
              <FaExternalLinkAlt className="text-xs" />
            </button>
            <div className="grid gap-2 sm:grid-cols-3">
              <CredentialRow account={DEMO_ACCOUNTS.admin} />
              <CredentialRow account={DEMO_ACCOUNTS.company} />
              <CredentialRow account={DEMO_ACCOUNTS.technician} />
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={demoEntryUrl('/login?demo=admin&auto=1')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Enter demo as Admin
              </a>
              {Object.entries(DEMO_ACCOUNTS)
                .filter(([key]) => key !== 'admin')
                .map(([key, acc]) => (
                  <a
                    key={acc.email}
                    href={demoEntryUrl(`/login?demo=${key}&auto=1`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50"
                  >
                    {acc.label}
                  </a>
                ))}
            </div>
          </>
        )}
      </div>

      {error && (
        <AlertModal isOpen title="Could not switch account" message={error} onClose={clearError} />
      )}
      {prodAlert && (
        <AlertModal isOpen title={prodAlert.title} message={prodAlert.message} onClose={() => setProdAlert(null)} />
      )}
    </>
  );
}

