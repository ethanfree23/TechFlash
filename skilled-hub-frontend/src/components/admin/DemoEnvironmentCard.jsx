import React, { useState, useCallback } from 'react';
import { FaExternalLinkAlt, FaCopy } from 'react-icons/fa';
import { DEMO_ACCOUNTS, DEMO_APP_URL } from '../../constants/demoAccounts';
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
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <p className="text-xs font-semibold text-slate-800">{account.label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-mono">{account.email}</span>
        <button
          type="button"
          onClick={() => copy(account.email, `${account.label}-email`)}
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-slate-50"
        >
          <FaCopy className="text-[9px]" />
          {copied === `${account.label}-email` ? 'Copied' : 'Copy email'}
        </button>
        <button
          type="button"
          onClick={() => copy(account.password, `${account.label}-pass`)}
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-slate-50"
        >
          <FaCopy className="text-[9px]" />
          {copied === `${account.label}-pass` ? 'Copied' : 'Copy password'}
        </button>
      </div>
    </div>
  );
}

export default function DemoEnvironmentCard() {
  const [alert, setAlert] = useState(null);
  const demoUrl = import.meta.env.VITE_DEMO_APP_URL || DEMO_APP_URL;

  const openDemo = () => {
    if (!demoUrl) {
      setAlert({ title: 'Demo URL not configured', message: 'Set VITE_DEMO_APP_URL on production Vercel.' });
      return;
    }
    window.open(demoUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 to-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold text-slate-900">Demo Environment</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Open a polished, isolated TechFlash demo workspace with fake marketplace activity across Houston,
              Austin, and Dallas.
            </p>
          </div>
          <button
            type="button"
            onClick={openDemo}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Open Demo Environment
            <FaExternalLinkAlt className="text-xs" />
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <CredentialRow account={DEMO_ACCOUNTS.admin} />
          <CredentialRow account={DEMO_ACCOUNTS.company} />
          <CredentialRow account={DEMO_ACCOUNTS.technician} />
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          One-click buttons open the demo and sign you in automatically. Masquerade shortcuts are available on the
          demo admin dashboard.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={`${demoUrl}/login?demo=admin&auto=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Enter demo as Admin
          </a>
          {Object.entries(DEMO_ACCOUNTS).filter(([key]) => key !== 'admin').map(([key, acc]) => (
            <a
              key={acc.email}
              href={`${demoUrl}/login?demo=${key}&auto=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50"
            >
              {acc.label}
            </a>
          ))}
        </div>
      </section>

      {alert && (
        <AlertModal
          isOpen
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
    </>
  );
}
